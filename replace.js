#!/usr/bin/env node

const fs = require('fs');
const path = require('path');


// 读取配置文件
const readConfig = () => {
  const configPath = path.resolve(process.cwd(), 'i18n.config.json');
  
  try {
    if (!fs.existsSync(configPath)) {
      throw new Error(`配置文件不存在: ${configPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // 验证必要配置项
    const requiredFields = ['outputDir', 'sourceFiles', 'targetFunctions', 'formatter'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`缺少必要配置项: ${field}`);
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

    console.log('成功加载配置文件:', configPath);
    return config;
  } catch (error) {
    console.error('读取配置文件失败:', error.message);
    process.exit(1);
  }
};

// 读取提取的文本
const readExtractedTexts = (outputDir, dirNames) => {
  let combinedTexts = {};
  let foundFiles = 0;
  let failedFiles = 0;
  let emptyFiles = 0;
  
  console.log('\n开始读取提取的文本文件...');
  
  // 验证输入参数
  if (!Array.isArray(dirNames)) {
    console.error('错误: dirNames必须是数组');
    throw new Error('dirNames必须是数组');
  }
  
  if (dirNames.length === 0) {
    console.error('错误: dirNames数组为空');
    throw new Error('dirNames数组为空');
  }
  
  // todo？ 尝试多种可能的文件名，需改称从config取配置
  const configPath = path.resolve(process.cwd(), 'i18n.config.json');
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configContent);
  const possibleFileNames = config.sourceFilesJson;
  
  for (const dirName of dirNames) {
    let fileFound = false;
    
    for (const fileName of possibleFileNames) {
      const extractedTextsPath = path.resolve(
        process.cwd(),
        dirName,
        fileName
      );
      
      if (!fs.existsSync(extractedTextsPath)) {
        if (process.env.DEBUG) {
          console.log('  文件不存在: ${extractedTextsPath}');
        }
        continue;
      }
      
      try {
        const extractedTextsContent = fs.readFileSync(extractedTextsPath, 'utf-8');
        
        // 检查文件是否为空
        if (!extractedTextsContent.trim()) {
          console.warn('警告: 文件为空 - ${extractedTextsPath}');
          emptyFiles++;
          continue;
        }
        
        let texts;
        try {
          texts = JSON.parse(extractedTextsContent);
        } catch (parseError) {
          console.error('解析JSON失败: ${extractedTextsPath}');
          console.error('  错误详情: ${parseError.message}');
          failedFiles++;
          continue;
        }
        
        // 验证解析后的内容是否为对象
        if (typeof texts !== 'object' || texts === null) {
          console.error('无效的JSON格式: ${extractedTextsPath} (不是对象)');
          failedFiles++;
          continue;
        }
        
        const textCount = Object.keys(texts).length;
        
        // 检查是否有文本条目
        if (textCount === 0) {
          console.warn('警告: 文件没有文本条目 - ${extractedTextsPath}');
          emptyFiles++;
          continue;
        }
        
        combinedTexts = {...combinedTexts, ...texts};
        foundFiles++;
        fileFound = true;
        
        console.log('√ 读取文件: ${extractedTextsPath} (${textCount} 条文本)');
          
        // 找到一个有效文件后就跳出内部循环
        break;
      } catch (error) {
        console.error(`读取文件失败: ${extractedTextsPath}`);
        console.error(`  错误详情: ${error.message}`);
        if (process.env.DEBUG) {
          console.error(`  堆栈跟踪: ${error.stack}`);
        }
        failedFiles++;
      }
    }
    
    if (!fileFound) {
      console.warn('警告: 目录中没有找到有效的文本文件 - ${dirName}');
    }
  }
  
  // 输出统计信息
  console.log('\n文件读取统计:');
  console.log('  成功: ${foundFiles} 个文件');
  if (failedFiles > 0) {
    console.log('  失败: ${failedFiles} 个文件');
  }
  if (emptyFiles > 0) {
    console.log('  空文件: ${emptyFiles} 个文件');
  }
  
  if (foundFiles === 0) {
    console.error('\n错误: 没有找到有效的提取文本文件');
    throw new Error('没有找到有效的提取文本文件');
  }
  
  const totalTexts = Object.keys(combinedTexts).length;
  console.log(`\n成功合并 ${foundFiles} 个文件, 共 ${totalTexts} 条文本`);
  
  return combinedTexts;
};

// 创建文本到key的映射
const createTextToKeyMap = (extractedTexts) => {
  const textToKeyMap = new Map();
  const duplicateTexts = new Map();
  let duplicateCount = 0;
  
  console.log('\n创建文本到key的映射...');
  
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
  console.log(`√ 创建 ${uniqueTexts} 条唯一文本映射`);
  
  // 输出重复文本警告
  if (duplicateCount > 0) {
    console.warn(`警告: 发现 ${duplicateCount} 处重复文本映射`);
    if (duplicateCount <= 5) {
      duplicateTexts.forEach((keys, text) => {
        console.warn('  "${text}" 映射到多个key: ${keys.join(', ')}');
      });
    } else {
      console.warn('  前5条重复文本:');
      let shown = 0;
      duplicateTexts.forEach((keys, text) => {
        if (shown++ < 5) {
          console.warn('  "${text}" 映射到多个key: ${keys.join(', ')}');
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
  let skippedFiles = 0;
  let accessErrors = 0;
  let startTime = Date.now();
  
  // 验证输入参数
  if (!Array.isArray(extensions)) {
    console.error('错误: extensions必须是数组');
    throw new Error('extensions必须是数组');
  }
  
  if (!Array.isArray(excludeDirs)) {
    console.error('错误: excludeDirs必须是数组');
    throw new Error('excludeDirs必须是数组');
  }
  
  if (!Array.isArray(excludeFiles)) {
    console.error('错误: excludeFiles必须是数组');
    throw new Error('excludeFiles必须是数组');
  }
  
  console.log(`\n扫描目录: ${dir}`);
  
  // 将排除模式编译为正则表达式以提高性能
  const excludeFilePatterns = excludeFiles.map(pattern => 
    new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'))
  );
  
  const scanDir = (currentDir) => {
    scannedDirs++;
    
    try {
      // 检查目录是否存在
      if (!fs.existsSync(currentDir)) {
        console.error(`目录不存在: ${currentDir}`);
        accessErrors++;
        return;
      }
      
      // 检查目录权限
      try {
        fs.accessSync(currentDir, fs.constants.R_OK);
      } catch (accessError) {
        console.error(`无权访问目录: ${currentDir}`);
        console.error(`  错误详情: ${accessError.message}`);
        accessErrors++;
        return;
      }
      
      let list;
      try {
        list = fs.readdirSync(currentDir);
      } catch (readError) {
        console.error(`读取目录失败: ${currentDir}`);
        console.error(`  错误详情: ${readError.message}`);
        accessErrors++;
        return;
      }
      
      for (const file of list) {
        const filePath = path.join(currentDir, file);
        
        let stat;
        try {
          stat = fs.statSync(filePath);
        } catch (statError) {
          console.error(`获取文件状态失败: ${filePath}`);
          console.error(`  错误详情: ${statError.message}`);
          accessErrors++;
          continue;
        }
        
        if (stat.isDirectory()) {
          // 检查是否在排除目录中
          const shouldExclude = excludeDirs.some(excludeDir => 
            filePath.includes(path.sep + excludeDir + path.sep) ||
            filePath.endsWith(path.sep + excludeDir)
          );
          
          if (shouldExclude) {
            skippedDirs++;
            if (process.env.DEBUG) {
              console.log(`  跳过目录: ${filePath} (匹配排除规则)`);
            }
            continue;
          }
          
          scanDir(filePath);
        } else if (stat.isFile()) {
          const ext = path.extname(file);
          const filename = path.basename(file);
          
          // 检查文件扩展名
          if (!extensions.includes(ext)) {
            skippedFiles++;
            if (process.env.DEBUG) {
              console.log(`  跳过文件: ${filePath} (扩展名${ext}不匹配)`);
            }
            continue;
          }
          
          // 检查排除规则
          const isExcluded = excludeFilePatterns.some(pattern => pattern.test(filename));
          
          if (isExcluded) {
            skippedFiles++;
            if (process.env.DEBUG) {
              console.log(`  跳过文件: ${filePath} (匹配排除模式)`);
            }
            continue;
          }
          
          // 检查文件是否可读
          try {
            fs.accessSync(filePath, fs.constants.R_OK);
          } catch (accessError) {
            console.error(`无法读取文件: ${filePath}`);
            console.error(`  错误详情: ${accessError.message}`);
            accessErrors++;
            continue;
          }
          
          results.push(filePath);
          
          // 每找到100个文件输出一次进度
          if (results.length % 100 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`  已找到 ${results.length} 个文件 (用时: ${elapsed}秒)`);
          }
        }
      }
    } catch (error) {
      console.error(`扫描目录失败: ${currentDir}`);
      console.error('  错误详情: ${error.message}');
      if (process.env.DEBUG) {
        console.error(`  堆栈跟踪: ${error.stack}`);
      }
      accessErrors++;
    }
  };
  
  scanDir(dir);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`√ 扫描完成 (${elapsed}秒)`); 
  console.log(`  扫描: ${scannedDirs} 个目录`);
  console.log(`  找到: ${results.length} 个文件`);
  console.log(`  跳过: ${skippedDirs} 个目录, ${skippedFiles} 个文件`);
  
  if (accessErrors > 0) {
    console.log(`  错误: ${accessErrors} 个访问错误`);
  }
  
  return results;
};

// 转义正则表达式特殊字符
const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// 替换文件中的文本 - 使用文本替换方式而非AST
const replaceTextsInFile = (filePath, textToKeyMap, targetFunctions, formatter, config) => {
  let replacements = 0;
  let jsxFunctionReplacements = 0; // 添加JSX函数替换计数器
  
  try {
    // 读取文件内容
    const code = fs.readFileSync(filePath, 'utf-8');
    let modifiedCode = code;
    
    // 遍历所有需要替换的文本
    for (const [text, key] of textToKeyMap) {
      // 构建替换模式
      const replacement = `${formatter[0]}('${key}')`;
      
      // 替换普通字符串，但前面不是==或===
      const stringPatterns = [
        new RegExp(`([^=]=[^=]|[^=]=|[^=]|^)\\s*"${escapeRegExp(text)}"`, 'g'),
        new RegExp(`([^=]=[^=]|[^=]=|[^=]|^)\\s*'${escapeRegExp(text)}'`, 'g')
      ];
      for (const strPattern of stringPatterns) {
        modifiedCode = modifiedCode.replace(strPattern, (match, p1) => {
          // 检查前面是否有==或===
          if (/==\s*$|===\s*$/.test(p1)) {
            return match; // 跳过
          }
          // 保留前缀，替换字符串
          return (p1 || '') + replacement;
        });
      }
      
      // 替换JSX属性
      for (const prop of config.targetProps) {
        if (config.skipProps && config.skipProps.includes(prop)) continue; // 跳过
        const propPattern = new RegExp(`${prop}=(["'])${escapeRegExp(text)}\\1`, 'g');
        modifiedCode = modifiedCode.replace(propPattern, `${prop}={${replacement}}`);
        
        // 替换已经使用国际化函数但没有使用花括号的情况，如 title=t('key') -> title={t('key')}
        for (const funcName of config.targetFunctions) {
          if (config.skipProps && config.skipProps.includes(prop)) continue;
          const funcPattern = new RegExp(`${prop}=${funcName}\\(['"]([^'"]+)['"]\\)`, 'g');
          const originalCode = modifiedCode;
          modifiedCode = modifiedCode.replace(funcPattern, `${prop}={${funcName}('$1')}`);
          
          // 如果有替换，更新计数器
          if (originalCode !== modifiedCode) {
            jsxFunctionReplacements += (originalCode.match(funcPattern) || []).length;
          }
        }
      }
      
      // 替换JSX文本
      modifiedCode = modifiedCode.replace(
        new RegExp(`>\\s*${escapeRegExp(text)}\\s*<`, 'g'), 
        `>{${replacement}}<`
      );
      
      replacements++;
    }
    
    // 如果有替换，先创建备份文件，然后修改文件
    if (replacements > 0) {
      // 创建备份文件
      const backupPath = `${filePath}.bak`;
      try {
        fs.copyFileSync(filePath, backupPath);
        console.log(`  创建备份文件: ${backupPath}`);
      } catch (backupError) {
        console.error(`创建备份文件失败: ${backupPath}`);
        console.error(`  错误详情: ${backupError.message}`);
        if (process.env.DEBUG) {
          console.error(`  堆栈跟踪: ${backupError.stack}`);
        }
        return { 
          modified: false, 
          backupCreated: false, 
          replacements: 0,
          jsxFunctionReplacements: 0 
        };
      }
      
      // 写入修改后的文件
      try {
        fs.writeFileSync(filePath, modifiedCode, 'utf-8');
        console.log(`√ 更新文件: ${filePath}`)
        console.log(`(${replacements} 处替换, ${jsxFunctionReplacements} 处JSX函数格式修复)`);
        return { 
          modified: true, 
          backupCreated: true, 
          replacements: replacements,
          jsxFunctionReplacements: jsxFunctionReplacements 
        };
      } catch (error) {
        console.error(`写入文件失败: ${filePath}`);
        console.error('  错误详情: ${error.message}');
        if (process.env.DEBUG) {
          console.error(`  堆栈跟踪: ${error.stack}`);
        }
        
        // 尝试从备份恢复
        try {
          fs.copyFileSync(backupPath, filePath);
          console.log(`  已从备份恢复文件: ${filePath}`);
        } catch (restoreError) {
          console.error(`恢复备份失败: ${filePath}`);
          console.error(`  错误详情: ${restoreError.message}`);
        }
        
        return false;
      }
    }
    
    console.log(`  无替换内容: ${filePath}`);
    return { 
      modified: false, 
      backupCreated: false, 
      replacements: 0,
      jsxFunctionReplacements: 0 
    };
    
  } catch (error) {
    console.error(`处理文件失败: ${filePath}`, error.message);
    return { 
      modified: false, 
      backupCreated: false, 
      replacements: 0,
      jsxFunctionReplacements: 0 
    };
  }
};

// 主函数
const main = () => {
  const startTime = Date.now();
  let totalFiles = 0;
  let totalModified = 0;
  let totalReplacements = 0;
  let totalJsxFunctionReplacements = 0; // 添加JSX函数替换总计数器
  let totalBackups = 0;
  let totalSkippedInType = 0;
  let totalSkippedFunctionCalls = 0;
  let errors = 0;
  const changeLog = {
    startTime: new Date(startTime).toISOString(),
    files: [],
    errors: []
  };
  
  console.log('\n开始国际化文本替换流程\n');
  
  try {
    // 读取配置
    const config = readConfig();
    
    // 输出配置信息
    console.log('配置信息:');
    console.log(`  扩展名: ${config.extensions.join(', ')}`);
    console.log(`  排除文件: ${config.excludeFiles.join(', ') || '无'}`);
    console.log(`  排除目录: ${config.excludeDirs.join(', ') || '无'}`);
    console.log(`  格式化函数: ${config.formatter.join(', ')}`);
    
    // 读取提取的文本
    const extractedTexts = readExtractedTexts(config.outputDir, config.sourceFiles);
    
    // 创建文本到key的映射
    const textToKeyMap = createTextToKeyMap(extractedTexts);
    
    // 获取文件列表
    const files = [];
    for (const dir of config.scanDirs) {
      try {
        const dirPath = path.resolve(process.cwd(), dir);
        if (!fs.existsSync(dirPath)) {
          console.warn(`警告: 目录不存在 - ${dirPath}`);
          continue;
        }
        files.push(...getFiles(dirPath, config.extensions, config.excludeDirs, config.excludeFiles));
      } catch (dirError) {
        console.error(`扫描目录失败: ${dir}`);
        console.error(`  错误详情: ${dirError.message}`);
        changeLog.errors.push({
          type: 'directory_scan',
          path: dir,
          error: dirError.message
        });
        errors++;
      }
    }
    totalFiles = files.length;
    
    if (totalFiles === 0) {
      console.warn('\n警告: 没有找到匹配的文件');
      console.log('请检查配置中的扩展名和排除规则是否正确');
      return;
    }
    
    console.log(`\n开始处理 ${totalFiles} 个文件...`);
    
    // 处理每个文件
    for (const [index, file] of files.entries()) {
      try {
        const progress = `${index + 1}/${totalFiles}`;
        const percent = Math.round(((index + 1) / totalFiles) * 100);
        process.stdout.write(`  [${progress} ${percent}%] 处理 ${file}... `);
        
        const result = replaceTextsInFile(file, textToKeyMap, config.targetFunctions, config.formatter, config);
        
        if (result.modified) {
          totalModified++;
          totalReplacements += result.replacements;
          totalJsxFunctionReplacements += result.jsxFunctionReplacements;
          
          changeLog.files.push({
            path: file,
            status: 'modified',
            replacements: result.replacements,
            jsxFunctionReplacements: result.jsxFunctionReplacements
          });
          
          if (result.jsxFunctionReplacements > 0) {
            process.stdout.write(`完成 (${result.replacements} 处替换, ${result.jsxFunctionReplacements} 处JSX函数格式修复)\n`);
          } else {
            process.stdout.write(`完成 (${result.replacements} 处替换)\n`);
          }
        } else {
          changeLog.files.push({
            path: file,
            status: 'unchanged'
          });
          process.stdout.write('无替换\n');
        }
      } catch (error) {
        errors++;
        process.stdout.write('失败\n');
        console.error(`  错误: ${error.message}`);
        changeLog.errors.push({
          type: 'file_processing',
          path: file,
          error: error.message
        });
        
        if (process.env.DEBUG) {
          console.error(`  堆栈跟踪: ${error.stack}`);
        }
      }
      
      // 每处理10个文件输出一次进度
      if ((index + 1) % 10 === 0 || index + 1 === totalFiles) {
        const percent = Math.round(((index + 1) / totalFiles) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  进度: ${percent}% (${index + 1}/${totalFiles}), 已用时间: ${elapsed}秒`);
      }
    }
    
    // 计算执行时间
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    changeLog.endTime = new Date(endTime).toISOString();
    changeLog.duration = `${duration}秒`;
    
    // 输出总结
    console.log('\n替换流程完成\n');
    console.log('√ 成功:', `${totalModified} 个文件被修改, ${totalFiles - totalModified - errors} 个文件无变化`);
    
    if (totalReplacements > 0) {
      console.log('  总替换数:', `${totalReplacements} 处文本`);
    }
    
    if (totalJsxFunctionReplacements > 0) {
      console.log('  JSX函数格式修复:', `${totalJsxFunctionReplacements} 处`);
    }
    
    if (errors > 0) {
      console.log('! 错误:', 
        `${errors} 个文件处理失败`);
    }
    
    console.log('⏱  耗时:', 
      `${duration} 秒`);
    console.log('📁 扫描目录:'), 
      config.scanDirs.map(dir => path.relative(process.cwd(), dir)).join(', ');
    
    // 保存变更日志
    try {
      const logPath = path.resolve(process.cwd(), 'i18n-replace-log.json');
      fs.writeFileSync(logPath, JSON.stringify(changeLog, null, 2), 'utf-8');
      console.log('📝 日志:', `已保存到 ${path.relative(process.cwd(), logPath)}`);
    } catch (logError) {
      console.warn('警告: 无法保存日志文件', logError.message);
    }
    
  } catch (error) {
    console.error('\n替换流程失败:', error.message);
    if (process.env.DEBUG) {
      console.error(`堆栈跟踪: ${error.stack}`);
    }
    process.exit(1);
  }
};

// 处理信号中断
process.on('SIGINT', () => {
  console.log('\n\n程序被用户中断');
  console.log('正在清理并退出...');
  
  // 这里可以添加清理代码，如保存日志等
  try {
    const interruptLog = {
      timestamp: new Date().toISOString(),
      status: 'interrupted',
      message: '程序被用户中断'
    };
    
    const logPath = path.resolve(process.cwd(), 'i18n-replace-interrupt.json');
    fs.writeFileSync(logPath, JSON.stringify(interruptLog, null, 2), 'utf-8');
    console.log('📝 中断日志:', `已保存到 ${path.relative(process.cwd(), logPath)}`);
  } catch (error) {
    console.error('保存中断日志失败:', error.message);
  }
  
  process.exit(1);
});

// 添加未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('\n未捕获的异常:', error.message);
  if (process.env.DEBUG) {
    console.error(`堆栈跟踪: ${error.stack}`);
  }
  
  try {
    const crashLog = {
      timestamp: new Date().toISOString(),
      status: 'crashed',
      error: error.message,
      stack: error.stack
    };
    
    const logPath = path.resolve(process.cwd(), 'i18n-replace-crash.json');
    fs.writeFileSync(logPath, JSON.stringify(crashLog, null, 2), 'utf-8');
    console.log('📝 崩溃日志:', `已保存到 ${path.relative(process.cwd(), logPath)}`);
  } catch (logError) {
    console.error('保存崩溃日志失败:', logError.message);
  }
  
  process.exit(1);
});

// 调用主函数
main();