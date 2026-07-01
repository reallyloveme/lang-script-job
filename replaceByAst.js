#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

// 尝试加载chalk，如果失败则使用简单的替代方案
let chalk;
try {
  chalk = require('chalk');
} catch (e) {
  // 更完善的chalk降级实现，支持链式调用
  const makeColorFn = (color) => {
    const fn = (str) => str;
    fn.bold = (str) => str;
    fn.underline = (str) => str;
    fn.dim = (str) => str;
    return fn;
  };
  
  chalk = {
    red: makeColorFn('red'),
    green: makeColorFn('green'),
    blue: makeColorFn('blue'),
    yellow: makeColorFn('yellow'),
    gray: makeColorFn('gray'),
    bold: (str) => str,
    underline: (str) => str,
    dim: (str) => str
  };
  
  console.warn('chalk未安装，将使用无颜色的输出');
  console.log('建议安装chalk以获得更好的输出体验，运行:');
  console.log('npm install chalk --save-dev');
}

// 读取配置文件
const readConfig = () => {
  const configPath = path.resolve(process.cwd(), 'i18n.config.json');
  
  try {
    if (!fs.existsSync(configPath)) {
      throw new Error(`配置文件不存在: ${chalk.yellow(configPath)}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // 验证必要配置项
    const requiredFields = ['outputDir', 'sourceFiles', 'targetFunctions', 'formatter'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`缺少必要配置项: ${chalk.yellow(field)}`);
      }
    }

    // 解析相对路径为绝对路径
    if (Array.isArray(config.sourceFiles)) {
      config.sourceFiles = config.sourceFiles.map(dir => 
        path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)
      );
    }
    
    if (config.outputDir && !path.isAbsolute(config.outputDir)) {
      config.outputDir = path.resolve(process.cwd(), config.outputDir);
    }

    console.log(chalk.green('成功加载配置文件:'), configPath);
    return config;
  } catch (error) {
    console.error(chalk.red('读取配置文件失败:'), error.message);
    process.exit(1);
  }
};

// 读取提取的文本
const readExtractedTexts = (outputDir, dirNames) => {
  let combinedTexts = {};
  let foundFiles = 0;
  
  console.log(chalk.blue('\n开始读取提取的文本文件...'));
  
  for (const dirName of dirNames) {
    const extractedTextsPath = path.resolve(
      process.cwd(),
      dirName,
      'extracted-texts.json'
    );
    
    if (!fs.existsSync(extractedTextsPath)) {
      console.warn(chalk.yellow(`警告: 文件不存在 - ${extractedTextsPath}`));
      continue;
    }
    
    try {
      const extractedTextsContent = fs.readFileSync(extractedTextsPath, 'utf-8');
      const texts = JSON.parse(extractedTextsContent);
      const textCount = Object.keys(texts).length;
      
      combinedTexts = {...combinedTexts, ...texts};
      foundFiles++;
      
      console.log(chalk.green(`√ 读取文件: ${extractedTextsPath}`), 
        chalk.gray(`(${textCount} 条文本)`));
    } catch (error) {
      console.error(chalk.red(`读取文件失败: ${extractedTextsPath}`), error.message);
      continue;
    }
  }
  
  if (foundFiles === 0) {
    console.error(chalk.red('错误: 没有找到有效的提取文本文件'));
    process.exit(1);
  }
  
  const totalTexts = Object.keys(combinedTexts).length;
  console.log(chalk.blue(`\n成功合并 ${foundFiles} 个文件, 共 ${totalTexts} 条文本`));
  
  return combinedTexts;
};

// 创建文本到key的映射
const createTextToKeyMap = (extractedTexts) => {
  const textToKeyMap = new Map();
  const duplicateTexts = new Map();
  let duplicateCount = 0;
  
  console.log(chalk.blue('\n创建文本到key的映射...'));
  
  for (const [key, text] of Object.entries(extractedTexts)) {
    if (textToKeyMap.has(text)) {
      // 记录重复文本
      if (!duplicateTexts.has(text)) {
        duplicateTexts.set(text, [textToKeyMap.get(text)]);
      }
      duplicateTexts.get(text).push(key);
      duplicateCount++;
    }
    textToKeyMap.set(text, key);
  }
  
  // 输出统计信息
  const uniqueTexts = textToKeyMap.size;
  console.log(chalk.green(`√ 创建 ${uniqueTexts} 条唯一文本映射`));
  
  // 输出重复文本警告
  if (duplicateCount > 0) {
    console.warn(chalk.yellow(`警告: 发现 ${duplicateCount} 处重复文本映射`));
    if (duplicateCount <= 5) {
      duplicateTexts.forEach((keys, text) => {
        console.warn(chalk.yellow(`  "${text}" 映射到多个key:`), keys.join(', '));
      });
    } else {
      console.warn(chalk.yellow('  前5条重复文本:'));
      let shown = 0;
      duplicateTexts.forEach((keys, text) => {
        if (shown++ < 5) {
          console.warn(chalk.yellow(`  "${text}" 映射到多个key:`), keys.join(', '));
        }
      });
    }
  }
  
  return textToKeyMap;
};

// 获取文件列表
const getFiles = (dir, extensions, excludeDirs, excludeFiles) => {
  let results = [];
  let scannedDirs = 0;
  let skippedDirs = 0;
  
  console.log(chalk.blue(`\n扫描目录: ${dir}`));
  
  const scanDir = (currentDir) => {
    scannedDirs++;
    
    try {
      const list = fs.readdirSync(currentDir);
      
      for (const file of list) {
        const filePath = path.join(currentDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // 检查是否在排除目录中
          const shouldExclude = excludeDirs.some(excludeDir => 
            filePath.includes(path.sep + excludeDir + path.sep) ||
            filePath.endsWith(path.sep + excludeDir)
          );
          
          if (shouldExclude) {
            skippedDirs++;
            console.log(chalk.yellow(`  跳过目录: ${filePath} (匹配排除规则)`));
            continue;
          }
          
          scanDir(filePath);
        } else {
          const ext = path.extname(file);
          const filename = path.basename(file);
          
          // 检查文件扩展名
          if (!extensions.includes(ext)) {
            console.log(chalk.yellow(`  跳过文件: ${filePath} (扩展名${ext}不匹配)`));
            continue;
          }
          
          // 检查排除规则
          const isExcluded = excludeFiles.some(pattern => 
            filename.match(new RegExp(pattern.replace('*', '.*')))
          );
          
          if (isExcluded) {
            console.log(chalk.yellow(`  跳过文件: ${filePath} (匹配排除模式)`));
            continue;
          }
          
          results.push(filePath);
        }
      }
    } catch (error) {
      console.error(chalk.red(`扫描目录失败: ${currentDir}`), error.message);
    }
  };
  
  scanDir(dir);
  
  console.log(chalk.green(`√ 扫描完成`), 
    chalk.gray(`(扫描 ${scannedDirs} 个目录, 跳过 ${skippedDirs} 个目录, 找到 ${results.length} 个文件)`));
  
  return results;
};

// 检查节点是否在TypeScript类型定义中
const isInTypeScriptType = (path, debug = false) => {
  // 检查常见TS类型节点
  const TS_TYPE_NODES = [
    'TSLiteralType',
    'TSTypeReference',
    'TSTypeAliasDeclaration',
    'TSInterfaceDeclaration',
    'TSTypeAnnotation',
    'TSAsExpression',
    'TSTypeAssertion',
    'TSEnumMember',
    'TSPropertySignature',
    'TSMethodSignature',
    'TSCallSignatureDeclaration',
    'TSConstructSignatureDeclaration',
    'TSIndexSignature',
    'TSTypeQuery',
    'TSTypeParameter',
    'TSTypeParameterInstantiation'
  ];

  // 检查直接父节点
  if (path.parent && TS_TYPE_NODES.includes(path.parent.type)) {
    if (debug) {
      console.log(chalk.gray(`  跳过类型定义中的文本: ${path.parent.type}`));
    }
    return true;
  }

  // 向上遍历AST检查祖先节点
  let current = path;
  while (current.parent) {
    const parentType = current.parent.type;
    
    if (TS_TYPE_NODES.includes(parentType)) {
      if (debug) {
        console.log(chalk.gray(`  跳过类型定义中的文本(祖先节点 ${parentType})`));
      }
      return true;
    }
    
    // 如果遇到非类型节点，可以提前终止
    if (parentType === 'VariableDeclarator' || 
        parentType === 'FunctionDeclaration' ||
        parentType === 'ClassDeclaration') {
      break;
    }
    
    current = current.parent;
  }

  return false;
};

// 替换文件中的文本
const replaceTextsInFile = (filePath, textToKeyMap, targetFunctions, formatter) => {
  let replacements = 0;
  let skippedInType = 0;
  
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    
    const fileExt = path.extname(filePath).slice(1);
    
    // 解析代码 - 使用与scan.js相同的插件配置
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'decorators-legacy',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'dynamicImport',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
    });
    
    // 遍历AST进行替换
    traverse(ast, {
      StringLiteral(path) {
        // 跳过TypeScript类型定义中的文本
        if (isInTypeScriptType(path)) {
          skippedInType++;
          return;
        }
        
        const value = path.node.value;
        if (textToKeyMap.has(value)) {
          const key = textToKeyMap.get(value);
          const formatterFilter = formatter[0]; // 使用formatter的第一个元素
          path.replaceWith(
            t.callExpression(
              t.identifier(formatterFilter),
              [t.stringLiteral(key, { singleQuote: true })] // 强制使用单引号
            )
          );
          replacements++;
        }
      },
      
      JSXText(path) {
        const value = path.node.value.trim();
        if (value && textToKeyMap.has(value)) {
          const key = textToKeyMap.get(value);
          const formatterFilter = formatter[0]; // 使用formatter的第一个元素
          path.replaceWith(
            t.jsxExpressionContainer(
              t.callExpression(
                t.identifier(formatterFilter),
                [t.stringLiteral(key, { singleQuote: true })] // 强制使用单引号
              )
            )
          );
          replacements++;
        }
      },
      
      // 处理JSX属性
      JSXAttribute(path) {
        if (path.node.value && t.isStringLiteral(path.node.value)) {
          const value = path.node.value.value;
          if (textToKeyMap.has(value)) {
            const key = textToKeyMap.get(value);
            const formatterFilter = formatter[0]; // 使用formatter的第一个元素
            path.node.value = t.jsxExpressionContainer(
              t.callExpression(
                t.identifier(formatterFilter),
                [t.stringLiteral(key, { singleQuote: true })] // 强制使用单引号
              )
            );
            replacements++;
          }
        }
      },
      
      // 处理模板字符串
      TemplateLiteral(path) {
        if (path.node.quasis.length === 1 && !path.node.quasis[0].value.raw.includes('${')) {
          const text = path.node.quasis[0].value.raw;
          if (textToKeyMap.has(text)) {
            const key = textToKeyMap.get(text);
            const formatterFilter = formatter[0]; // 使用formatter的第一个元素
            path.replaceWith(
              t.callExpression(
                t.identifier(formatterFilter),
                [t.stringLiteral(key, { singleQuote: true })] // 强制使用单引号
              )
            );
            replacements++;
          }
        }
      }
    });
    
    // 如果有替换，生成并写入新代码
    if (replacements > 0) {
      // 清理AST中的空语句
      traverse(ast, {
        EmptyStatement(path) {
          path.remove();
        }
      });
      
      // 生成代码时完全保留原始格式
      const output = generate(ast, {
        retainLines: true,
        compact: false,
        comments: true,
        jsescOption: { quotes: 'single' },
        shouldPrintSemicolon: false,
        concise: false,
        retainFunctionParens: true,
        preserveBlankLines: true,
        jsonCompatibleStrings: true,
        // 完全禁用格式化
        minified: false,
        // 使用原始代码作为基准
        sourceMaps: false,
        sourceMapTarget: null,
        // 保留所有格式细节
        decoratorsBeforeExport: false,
        // 不修改任何空白
        indent: {
          adjustMultilineComment: false,
          style: '    ',
          base: 0
        }
      }, code);
      
      // 后处理：确保文件末尾没有分号（处理所有可能的换行情况）
      let finalCode = output.code
        .replace(/(;)(\s*)([)\]}'\"]*)(\s*)$/, '$2$3$4') // 移除末尾分号，保留其他字符和空格
        .replace(/\n+$/, '\n'); // 确保只有一个换行符
      fs.writeFileSync(filePath, finalCode, 'utf-8');
      console.log(chalk.green(`√ 更新文件: ${filePath}`), 
        chalk.gray(`(${replacements} 处替换, ${skippedInType} 处跳过类型定义中的文本)`));
      return true;
    }
    
    if (process.env.DEBUG) {
      console.log(chalk.gray(`  无替换内容: ${filePath}`));
    }
    return false;
    
  } catch (error) {
    console.error(chalk.red(`处理文件失败: ${filePath}`), error.message);
    return false;
  }
};

// 主函数
const main = () => {
  const startTime = Date.now();
  let totalFiles = 0;
  let totalModified = 0;
  let totalReplacements = 0;
  let totalSkippedInType = 0;
  let errors = 0;
  
  console.log(chalk.blue.bold('\n开始国际化文本替换流程\n'));
  
  try {
    // 读取配置
    const config = readConfig();
    // 在main函数中添加
console.log('使用的扩展名配置:', config.extensions);
console.log('排除的文件模式:', config.excludeFiles);
    
    // 读取提取的文本
    const extractedTexts = readExtractedTexts(config.outputDir, config.sourceFiles);
    
    // 创建文本到key的映射
    const textToKeyMap = createTextToKeyMap(extractedTexts);
    
    // 获取文件列表
    const files = [];
    for (const dir of config.scanDirs) {
      const dirPath = path.resolve(process.cwd(), dir);
      files.push(...getFiles(dirPath, config.extensions, config.excludeDirs, config.excludeFiles));
    }
    totalFiles = files.length;
    
    console.log(chalk.blue(`\n开始处理 ${totalFiles} 个文件...`));
    
    // 处理每个文件
    for (const [index, file] of files.entries()) {
      try {
        const progress = `${index + 1}/${totalFiles}`;
        process.stdout.write(chalk.gray(`  [${progress}] 处理 ${file}... `));
        
        const result = replaceTextsInFile(file, textToKeyMap, config.targetFunctions, config.formatter);
        if (result) {
          totalModified++;
          process.stdout.write(chalk.green('完成\n'));
        } else {
          process.stdout.write(chalk.gray('无替换\n'));
        }
      } catch (error) {
        errors++;
        process.stdout.write(chalk.red('失败\n'));
        console.error(chalk.red(`  错误: ${error.message}`));
      }
    }
    
    // 计算执行时间
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // 输出总结
    console.log(chalk.blue.bold('\n替换流程完成\n'));
    console.log(chalk.green('√ 成功:'), 
      `${totalModified} 个文件被修改, ${totalFiles - totalModified} 个文件无变化`);
    console.log(chalk.yellow('! 错误:'), 
      `${errors} 个文件处理失败`);
    console.log(chalk.blue('⏱  耗时:'), 
      `${duration} 秒`);
    console.log(chalk.blue('📁 扫描目录:'), 
      config.scanDirs.map(dir => path.relative(process.cwd(), dir)).join(', '));
    
  } catch (error) {
    console.error(chalk.red.bold('\n替换流程失败:'), error.message);
    process.exit(1);
  }
};

// 调用主函数
main();