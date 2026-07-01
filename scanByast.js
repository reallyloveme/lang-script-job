#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

// 创建结果存储对象的工厂函数
function createExtractionResults() {
  return {
    totalFiles: 0,
    processedFiles: 0,
    skippedFiles: 0,
    texts: new Set(),
    scannedFiles: [],       // 记录扫描过的文件
    errorFiles: [],         // 记录出错的文件
    fileDetails: [],        // 每个文件的详细扫描记录
    errors: []              // 详细错误记录
  };
}

// 全局结果存储（用于向后兼容）
const extractionResults = createExtractionResults();

// 每个目录的结果存储
const dirResults = new Map();

// 读取配置文件
function loadConfigFile() {
  const configPath = path.join(process.cwd(), 'i18n.config.json');
  
  try {
    if (fs.existsSync(configPath)) {
      console.log(`发现配置文件: ${configPath}`);
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('成功加载配置文件');
      return fileConfig;
    }
  } catch (error) {
    console.error(`读取配置文件失败: ${error.message}`);
    console.log('将使用默认配置');
  }
  
  return {};
}

// 合并配置
function mergeConfig(defaultConfig, fileConfig) {
  const merged = { ...defaultConfig };
  
  // 合并简单属性
  for (const key in fileConfig) {
    if (key === 'scanDirs') {
      // 特殊处理scanDirs，将相对路径转换为绝对路径
      if (Array.isArray(fileConfig.scanDirs)) {
        merged.scanDirs = fileConfig.scanDirs.map(dir => 
          path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir)
        );
      }
    } else if (key === 'outputDir') {
      // 特殊处理outputDir，将相对路径转换为绝对路径
      if (typeof fileConfig.outputDir === 'string') {
        merged.outputDir = path.isAbsolute(fileConfig.outputDir) 
          ? fileConfig.outputDir 
          : path.join(process.cwd(), fileConfig.outputDir);
      }
    } else if (key in merged) {
      // 合并其他属性
      merged[key] = fileConfig[key];
    }
  }
  
  return merged;
}

// 默认配置选项
const defaultConfig = {
  // 要扫描的目录
  scanDirs: [
    // path.join(process.cwd(), 'src/pages/homepage'),
    // path.join(process.cwd(), 'src/pages/employee')
  ],
  // 当前正在处理的扫描目录
  currentScanDir: null,
  // 文件扩展名
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  // 排除的目录
  excludeDirs: ['node_modules', '.next', 'build', 'dist'],
  // 排除的文件
  excludeFiles: ['*.test.*', '*.spec.*', '*.d.ts'],
  // 要提取的属性名
  targetProps: ['name', 'label', 'title', 'emptyText', 'tooltip', 'placeholder', 'description', 'buttonText'],
  // 要提取的函数名
  targetFunctions: ['titleShow', 't', 'i18n', 'translate'],
  // 要提取的成员函数名（对象.方法）
  targetMemberFunctions: [
    'message.success',
    'message.error',
    'notification.success',
    'notification.error'
  ],
  // 排除的文本
  excludeTexts: [],
  // 输出配置
  outputDir: path.join(process.cwd(), 'i18n-output'),
  // 日志配置
  logLevel: 'detailed', // 'basic', 'detailed', 'debug'
};

// 加载配置文件并合并配置
const fileConfig = loadConfigFile();
const config = mergeConfig(defaultConfig, fileConfig);

// 添加向后兼容的方法
config.getOutputSubDir = function() {
  if (!this.currentScanDir) {
    return '';
  }
  return getOutputSubDirForDir(this.currentScanDir);
};

Object.defineProperties(config, {
  outputSubDir: {
    get: function() {
      if (!this.currentScanDir) {
        return path.join(this.outputDir, 'scan');
      }
      return getOutputPathForDir(this.currentScanDir);
    }
  },
  
  logFile: {
    get: function() {
      if (!this.currentScanDir) {
        return path.join(this.outputDir, 'scan', 'scan_log.json');
      }
      return getLogFileForDir(this.currentScanDir);
    }
  },
  
  perFileLog: {
    get: function() {
      if (!this.currentScanDir) {
        return path.join(this.outputDir, 'scan', 'file_scan_log.json');
      }
      return getPerFileLogForDir(this.currentScanDir);
    }
  },
  
  detailedFileLog: {
    get: function() {
      if (!this.currentScanDir) {
        return path.join(this.outputDir, 'scan', 'detailed_file_log.json');
      }
      return getDetailedFileLogForDir(this.currentScanDir);
    }
  },
  
  extractedTextsFile: {
    get: function() {
      if (!this.currentScanDir) {
        return path.join(this.outputDir, 'scan', 'extracted-texts.json');
      }
      return getExtractedTextsFileForDir(this.currentScanDir);
    }
  },
  
  errorLogFile: {
    get: function() {
      if (!this.currentScanDir) {
        return path.join(this.outputDir, 'scan', 'scan_errors.json');
      }
      return getErrorLogFileForDir(this.currentScanDir);
    }
  },
  
  detailedScanLogFile: {
    get: function() {
      if (!this.currentScanDir) {
        return path.join(this.outputDir, 'scan', 'detailed_scan_log.json');
      }
      return getDetailedScanLogFileForDir(this.currentScanDir);
    }
  }
});

// 显示最终配置
if (Object.keys(fileConfig).length > 0) {
  console.log('使用合并后的配置:');
  console.log(`- 扫描目录: ${config.scanDirs.map(dir => path.relative(process.cwd(), dir)).join(', ')}`);
  console.log(`- 文件扩展名: ${config.extensions.join(', ')}`);
  console.log(`- 输出目录: ${path.relative(process.cwd(), config.outputDir)}`);
  console.log(`- 日志级别: ${config.logLevel}`);
}

// 确保输出目录存在 - 向后兼容的方法
function ensureOutputDirExists() {
  if (config.currentScanDir) {
    return ensureOutputDirForDir(config.currentScanDir);
  }
  
  // 确保主输出目录存在
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    console.log(`创建主输出目录: ${config.outputDir}`);
  }
  
  // 创建默认的子目录
  const defaultSubDir = path.join(config.outputDir, 'scan');
  if (!fs.existsSync(defaultSubDir)) {
    fs.mkdirSync(defaultSubDir, { recursive: true });
    console.log(`创建默认输出子目录: ${defaultSubDir}`);
  }
  
  return defaultSubDir;
}
// 文件扫描日志记录函数
function logFileScan(filePath, extractedTexts = [], error = null, results = extractionResults) {
  // 记录到扫描文件列表
  results.scannedFiles.push(filePath);
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    file: filePath,
    relativePath: path.relative(process.cwd(), filePath),
    status: error ? 'error' : 'success',
    extractedCount: extractedTexts.length,
    extractedTexts: extractedTexts,
    stats: {
      size: fs.statSync(filePath).size,
      mtime: fs.statSync(filePath).mtime
    }
  };

  // 如果有错误，添加错误信息
  if (error) {
    logEntry.error = {
      message: error.message,
      stack: config.logLevel === 'debug' ? error.stack : undefined
    };
    results.errorFiles.push(filePath);
  }

  results.fileDetails.push(logEntry);

  // 如果是详细日志模式，立即写入单独的文件日志
  if (config.logLevel === 'detailed' || config.logLevel === 'debug') {
    try {
      // 获取当前处理的目录
      const currentDir = config.currentScanDir;
      
      // 确保输出目录存在
      ensureOutputDirForDir(currentDir);
      
      // 获取文件日志路径
      const perFileLog = getPerFileLogForDir(currentDir);
      
      // 追加写入文件，而不是覆盖
      fs.appendFileSync(
        perFileLog, 
        JSON.stringify(logEntry) + '\n'
      );
    } catch (err) {
      console.error(`无法记录文件日志: ${filePath}`, err);
    }
  }
  
  return logEntry;
}

// 错误记录函数
function logError(filePath, error, context = {}, results = extractionResults) {
  const errorEntry = {
    timestamp: new Date().toISOString(),
    file: filePath,
    error: error.toString(),
    stack: error.stack,
    context
  };

  results.errors.push(errorEntry);

  // 在控制台显示错误
  console.error(`[ERROR] ${filePath}: ${error.message}`);
}
// 写入日志文件函数 - 向后兼容的方法
function writeLogFile() {
  if (config.currentScanDir) {
    // 如果有当前处理的目录，使用新的方法
    return writeLogFileForDir(config.currentScanDir, dirResults.get(config.currentScanDir) || extractionResults);
  }
  
  // 否则使用全局结果
  const logData = {
    timestamp: new Date().toISOString(),
    config: {
      scanDirs: config.scanDirs,
      extensions: config.extensions,
      excludeDirs: config.excludeDirs,
      excludeFiles: config.excludeFiles,
      targetProps: config.targetProps,
      targetFunctions: config.targetFunctions,
      targetMemberFunctions: config.targetMemberFunctions,
      outputDir: config.outputDir,
      logLevel: config.logLevel
    },
    summary: {
      totalFiles: extractionResults.totalFiles,
      processedFiles: extractionResults.processedFiles,
      skippedFiles: extractionResults.skippedFiles,
      errorFiles: extractionResults.errorFiles.length,
      extractedTextsCount: extractionResults.texts.size
    },
    results: {
      texts: Array.from(extractionResults.texts).sort(),  // 将Set转为排序后的Array
      scannedFiles: extractionResults.scannedFiles,
      errorFiles: extractionResults.errorFiles
    }
  };

  try {
    // 确保输出目录存在
    ensureOutputDirExists();
    
    // 写入主日志文件
    fs.writeFileSync(config.logFile, JSON.stringify(logData, null, 2));
    console.log(`主日志已写入: ${path.relative(process.cwd(), config.logFile)}`);
    
    // 如果是详细日志模式，写入详细的文件处理记录
    if (config.logLevel === 'detailed' || config.logLevel === 'debug') {
      const detailedLogData = {
        timestamp: new Date().toISOString(),
        fileDetails: extractionResults.fileDetails
      };
      
      fs.writeFileSync(
        config.detailedScanLogFile,
        JSON.stringify(detailedLogData, null, 2)
      );
      console.log(`详细日志已写入: ${path.relative(process.cwd(), config.detailedScanLogFile)}`);
    }
    
    // 如果是调试模式，写入错误记录
    if (config.logLevel === 'debug' && extractionResults.errors.length > 0) {
      fs.writeFileSync(
        config.errorLogFile,
        JSON.stringify(extractionResults.errors, null, 2)
      );
      console.log(`错误日志已写入: ${path.relative(process.cwd(), config.errorLogFile)}`);
    }
    
    // 写入提取的文本 - 转换为键值对格式
    const textsArray = Array.from(extractionResults.texts).sort();
    const textsObject = {};
    
    // 为每个文本生成唯一键名：scan0001递增
    textsArray.forEach((text, index) => {
      // 生成键名，例如：scan0001, scan0002, ...
      const keyId = String(index + 1).padStart(4, '0');
      const key = `scan${keyId}`;
      textsObject[key] = text;
    });
    
    fs.writeFileSync(
      config.extractedTextsFile,
      JSON.stringify(textsObject, null, 2)
    );
    console.log(`提取的文本已写入: ${path.relative(process.cwd(), config.extractedTextsFile)}`);
  } catch (err) {
    console.error('写入日志文件失败:', err);
  }
}

process.on('exit', writeLogFile);
// process.on('SIGINT', () => {
//   writeLogFile();
//   process.exit();
// });

// 主处理函数
async function extractFromProject() {
  console.log('开始提取项目中的国际化文本...');
  console.log(`日志级别: ${config.logLevel}`);
  
  const startTime = Date.now();
  
  // 清空全局结果
  Object.assign(extractionResults, createExtractionResults());
  
  // 清空目录结果映射
  dirResults.clear();
  
  // 为每个目录单独处理
  for (const dir of config.scanDirs) {
    // 为当前目录创建结果对象
    const currentDirResult = createExtractionResults();
    dirResults.set(dir, currentDirResult);
    
    // 设置当前处理的目录
    config.currentScanDir = dir;
    
    // 确保当前目录的输出子目录存在
    ensureOutputDirForDir(dir);
    
    console.log(`\n处理扫描目录: ${dir}`);
    
    // 初始化当前目录的日志文件
    if (config.logLevel === 'detailed' || config.logLevel === 'debug') {
      // 创建或清空文件日志
      const perFileLog = getPerFileLogForDir(dir);
      fs.writeFileSync(perFileLog, '');
      console.log(`文件日志已初始化: ${perFileLog}`);
    }
    
    // 处理当前目录
    await processDirectory(dir, currentDirResult);
    
    // 写入当前目录的日志文件
    writeLogFileForDir(dir, currentDirResult);
    
    // 将当前目录的结果合并到全局结果中（用于向后兼容）
    mergeResults(extractionResults, currentDirResult);
  }

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  console.log('\n所有目录处理完成！');
  console.log(`总耗时: ${duration.toFixed(2)}秒`);
  console.log(`共扫描文件: ${extractionResults.totalFiles}`);
  console.log(`已处理文件: ${extractionResults.processedFiles}`);
  console.log(`跳过文件: ${extractionResults.skippedFiles}`);
  console.log(`错误文件: ${extractionResults.errorFiles.length}`);
  console.log(`提取的文本总数量: ${extractionResults.texts.size}\n`);
  
  // 显示每个目录的处理结果
  console.log('各目录处理结果:');
  for (const [dir, result] of dirResults.entries()) {
    const dirName = path.basename(dir);
    console.log(`\n目录 ${dirName}:`);
    console.log(`- 扫描文件: ${result.totalFiles}`);
    console.log(`- 处理文件: ${result.processedFiles}`);
    console.log(`- 提取文本: ${result.texts.size}`);
    console.log(`- 输出目录: ${getOutputSubDirForDir(dir)}`);
  }
}

// 合并两个结果对象
function mergeResults(target, source) {
  target.totalFiles += source.totalFiles;
  target.processedFiles += source.processedFiles;
  target.skippedFiles += source.skippedFiles;
  
  // 合并文本集合
  for (const text of source.texts) {
    target.texts.add(text);
  }
  
  // 合并文件列表
  target.scannedFiles.push(...source.scannedFiles);
  target.errorFiles.push(...source.errorFiles);
  target.fileDetails.push(...source.fileDetails);
  target.errors.push(...source.errors);
}

// 获取特定目录的输出子目录名称
function getOutputSubDirForDir(dir) {
  // 获取目录名称
  const dirName = path.basename(dir);
  // 移除特殊字符，确保目录名有效
  return dirName.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// 获取特定目录的输出子目录完整路径
function getOutputPathForDir(dir) {
  return path.join(config.outputDir, getOutputSubDirForDir(dir));
}

// 确保特定目录的输出子目录存在
function ensureOutputDirForDir(dir) {
  // 确保主输出目录存在
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    console.log(`创建主输出目录: ${config.outputDir}`);
  }
  
  // 获取当前目录的输出子目录
  const outputSubDir = getOutputPathForDir(dir);
  
  // 确保子目录存在
  if (!fs.existsSync(outputSubDir)) {
    fs.mkdirSync(outputSubDir, { recursive: true });
    console.log(`创建输出子目录: ${outputSubDir}`);
    console.log(`(基于扫描目录: ${path.basename(dir)})`);
  }
  
  return outputSubDir;
}

// 获取特定目录的日志文件路径
function getLogFileForDir(dir) {
  return path.join(getOutputPathForDir(dir), 'scan_log.json');
}

function getPerFileLogForDir(dir) {
  return path.join(getOutputPathForDir(dir), 'file_scan_log.json');
}

function getDetailedFileLogForDir(dir) {
  return path.join(getOutputPathForDir(dir), 'detailed_file_log.json');
}

function getExtractedTextsFileForDir(dir) {
  return path.join(getOutputPathForDir(dir), 'extracted-texts.json');
}

function getErrorLogFileForDir(dir) {
  return path.join(getOutputPathForDir(dir), 'scan_errors.json');
}

function getDetailedScanLogFileForDir(dir) {
  return path.join(getOutputPathForDir(dir), 'detailed_scan_log.json');
}

// 递归处理目录
async function processDirectory(dir, results = extractionResults) {
  if (shouldSkipDir(dir)) {
    if (config.logLevel === 'debug') {
      console.log(`跳过目录: ${dir}`);
    }
    return;
  }

  try {
    const files = fs.readdirSync(dir);
    
    if (config.logLevel === 'debug') {
      console.log(`处理目录: ${dir} (包含 ${files.length} 个文件/目录)`);
    }
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      
      try {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          await processDirectory(fullPath, results);
        } else if (shouldProcessFile(fullPath)) {
          await processFile(fullPath, results);
        } else {
          results.skippedFiles++;
          if (config.logLevel === 'debug') {
            console.log(`跳过文件: ${fullPath}`);
          }
        }
      } catch (error) {
        console.error(`处理 ${fullPath} 时出错:`, error.message);
        logError(fullPath, error, { stage: 'directory_processing' }, results);
      }
    }
  } catch (error) {
    console.error(`读取目录 ${dir} 时出错:`, error.message);
    logError(dir, error, { stage: 'directory_reading' }, results);
  }
}

// 处理单个文件
async function processFile(filePath, results = extractionResults) {
  results.totalFiles++;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileExtractedTexts = extractTextsFromAST(content, filePath, results);
    results.processedFiles++;
    
    // 记录文件处理结果
    logFileScan(filePath, fileExtractedTexts, null, results);
    
    // 如果是详细日志模式，记录每个文件的提取详情
    if (config.logLevel === 'detailed' || config.logLevel === 'debug') {
      const fileLog = {
        file: filePath,
        relativePath: path.relative(process.cwd(), filePath),
        extractedTexts: fileExtractedTexts,
        timestamp: new Date().toISOString()
      };
      
      // 获取当前处理的目录
      const currentDir = config.currentScanDir;
      
      // 确保输出目录存在
      ensureOutputDirForDir(currentDir);
      
      // 获取详细文件日志路径
      const detailedFileLog = getDetailedFileLogForDir(currentDir);
      
      // 追加到详细日志文件
      try {
        const logData = fs.existsSync(detailedFileLog) 
          ? JSON.parse(fs.readFileSync(detailedFileLog, 'utf8')) 
          : [];
        logData.push(fileLog);
        fs.writeFileSync(detailedFileLog, JSON.stringify(logData, null, 2));
      } catch (err) {
        console.error(`无法写入详细文件日志: ${filePath}`, err);
      }
    }
    
  } catch (error) {
    console.error(`处理文件 ${filePath} 时出错:`, error);
    logError(filePath, error, { stage: 'file_processing' }, results);
    logFileScan(filePath, [], error, results);
    results.skippedFiles++;
  }
}

// 使用AST提取文本
function extractTextsFromAST(content, filePath, results = extractionResults) {
  // 存储当前文件提取的文本
  const fileTexts = new Set();
  
  try {
    const ast = parser.parse(content, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'decorators-legacy'
      ]
    });

    traverse(ast, {
      // 提取JSX文本
      JSXText(path) {
        const text = path.node.value.trim();
        if (shouldExtract(text)) {
          results.texts.add(text);
          fileTexts.add(text);
        }
      },

      // 提取对象属性
      ObjectProperty(path) {
        if (t.isIdentifier(path.node.key) && 
            config.targetProps.includes(path.node.key.name)) {
          extractNodeValue(path.node.value, fileTexts, results);
        }
      },

      // 提取函数调用参数
      CallExpression(path) {
        let functionName = '';
        let memberFunctionName = '';
        // 处理直接标识符调用 (如 translate())
        if (t.isIdentifier(path.node.callee)) {
          functionName = path.node.callee.name;
        } 
        // 处理成员表达式调用 (如 i18n.translate() 或 message.success())
        else if (t.isMemberExpression(path.node.callee) && 
                 t.isIdentifier(path.node.callee.property)) {
          functionName = path.node.callee.property.name;
          if (t.isIdentifier(path.node.callee.object)) {
            memberFunctionName = path.node.callee.object.name + '.' + path.node.callee.property.name;
          }
        }
        
        if (config.targetFunctions.includes(functionName)) {
          // 确保至少有一个参数
          if (path.node.arguments.length > 0) {
            // 特别处理第一个参数，通常是文本内容
            const firstArg = path.node.arguments[0];
            if (t.isStringLiteral(firstArg)) {
              const text = firstArg.value.trim();
              if (shouldExtract(text)) {
                results.texts.add(text);
                if (fileTexts) fileTexts.add(text);
                if (config.logLevel === 'debug') {
                  console.log(`提取 ${functionName} 函数文本: "${text}"`);
                }
              }
            } else if (t.isTemplateLiteral(firstArg)) {
              // 处理模板字符串
              const text = firstArg.quasis
                .map(quasi => quasi.value.raw)
                .join('')
                .trim();
              if (shouldExtract(text)) {
                results.texts.add(text);
                if (fileTexts) fileTexts.add(text);
                if (config.logLevel === 'debug') {
                  console.log(`提取 ${functionName} 函数模板文本: "${text}"`);
                }
              }
            }
            
            // 处理其他参数
            path.node.arguments.slice(1).forEach(arg => {
              if (t.isStringLiteral(arg) || t.isTemplateLiteral(arg)) {
                extractNodeValue(arg, fileTexts, results);
              }
            });
          }
        }
        // 新增 targetMemberFunctions 逻辑
        if (memberFunctionName && config.targetMemberFunctions.includes(memberFunctionName)) {
          if (path.node.arguments.length > 0) {
            const firstArg = path.node.arguments[0];
            if (t.isStringLiteral(firstArg)) {
              const text = firstArg.value.trim();
              if (shouldExtract(text)) {
                results.texts.add(text);
                if (fileTexts) fileTexts.add(text);
                if (config.logLevel === 'debug') {
                  console.log(`提取 ${memberFunctionName} 成员函数文本: "${text}"`);
                }
              }
            } else if (t.isTemplateLiteral(firstArg)) {
              const text = firstArg.quasis
                .map(quasi => quasi.value.raw)
                .join('')
                .trim();
              if (shouldExtract(text)) {
                results.texts.add(text);
                if (fileTexts) fileTexts.add(text);
                if (config.logLevel === 'debug') {
                  console.log(`提取 ${memberFunctionName} 成员函数模板文本: "${text}"`);
                }
              }
            }
            // 处理其他参数
            path.node.arguments.slice(1).forEach(arg => {
              if (t.isStringLiteral(arg) || t.isTemplateLiteral(arg)) {
                extractNodeValue(arg, fileTexts, results);
              }
            });
          }
        }
      },

      // 提取JSX属性 - 增强处理
      JSXAttribute(path) {
        const propName = path.node.name.name;
        if (config.targetProps.includes(propName)) {
          // 处理字符串字面量属性值
          if (t.isStringLiteral(path.node.value)) {
            const text = path.node.value.value.trim();
            if (shouldExtract(text)) {
              results.texts.add(text);
              if (fileTexts) fileTexts.add(text);
              if (config.logLevel === 'debug') {
                console.log(`提取 ${propName} 属性文本: "${text}"`);
              }
            }
          } 
          // 处理JSX表达式容器中的字符串
          else if (t.isJSXExpressionContainer(path.node.value)) {
            const expr = path.node.value.expression;
            if (t.isStringLiteral(expr)) {
              const text = expr.value.trim();
              if (shouldExtract(text)) {
                results.texts.add(text);
                if (fileTexts) fileTexts.add(text);
                if (config.logLevel === 'debug') {
                  console.log(`提取 ${propName} 表达式文本: "${text}"`);
                }
              }
            }
          }
          // 处理直接赋值的JSX文本
          else if (t.isJSXText(path.node.value)) {
            const text = path.node.value.value.trim();
            if (shouldExtract(text)) {
              results.texts.add(text);
              if (fileTexts) fileTexts.add(text);
              if (config.logLevel === 'debug') {
                console.log(`提取 ${propName} JSX文本: "${text}"`);
              }
            }
          }
        }
      }
    });

    return Array.from(fileTexts);
  } catch (error) {
    console.error(`解析文件 ${filePath} 的AST时出错:`, error);
    logError(filePath, error, { stage: 'ast_parsing' }, results);
    return [];
  }
}

// 提取节点值
function extractNodeValue(node, fileTexts = null, results = extractionResults) {
  let text = '';
  
  if (t.isStringLiteral(node)) {
    text = node.value.trim();
  } else if (t.isTemplateLiteral(node)) {
    // 处理模板字符串，拼接所有静态部分
    text = node.quasis
      .map(quasi => quasi.value.raw)
      .join('')
      .trim();
  } else if (t.isJSXText(node)) {
    text = node.value.trim();
  }
  
  if (text && shouldExtract(text)) {
    results.texts.add(text);
    if (fileTexts) fileTexts.add(text);
    if (config.logLevel === 'debug') {
      console.log(`提取文本: "${text}" (来自 ${node.type})`);
    }
  }
}

// 为特定目录写入日志文件
function writeLogFileForDir(dir, results) {
  const logData = {
    timestamp: new Date().toISOString(),
    config: {
      scanDir: dir,
      scanDirName: path.basename(dir),
      extensions: config.extensions,
      excludeDirs: config.excludeDirs,
      excludeFiles: config.excludeFiles,
      targetProps: config.targetProps,
      targetFunctions: config.targetFunctions,
      targetMemberFunctions: config.targetMemberFunctions,
      outputDir: config.outputDir,
      outputSubDir: getOutputPathForDir(dir),
      logLevel: config.logLevel
    },
    summary: {
      totalFiles: results.totalFiles,
      processedFiles: results.processedFiles,
      skippedFiles: results.skippedFiles,
      errorFiles: results.errorFiles.length,
      extractedTextsCount: results.texts.size
    },
    results: {
      texts: Array.from(results.texts).sort(),  // 将Set转为排序后的Array
      scannedFiles: results.scannedFiles,
      errorFiles: results.errorFiles
    }
  };

  try {
    // 确保输出目录存在
    const outputSubDir = ensureOutputDirForDir(dir);
    
    // 获取日志文件路径
    const logFile = getLogFileForDir(dir);
    
    // 写入主日志文件
    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
    console.log(`目录 ${path.basename(dir)} 的主日志已写入: ${path.relative(process.cwd(), logFile)}`);
    
    // 如果是详细日志模式，写入详细的文件处理记录
    if (config.logLevel === 'detailed' || config.logLevel === 'debug') {
      const detailedLogData = {
        timestamp: new Date().toISOString(),
        fileDetails: results.fileDetails
      };
      
      const detailedScanLogFile = getDetailedScanLogFileForDir(dir);
      fs.writeFileSync(
        detailedScanLogFile,
        JSON.stringify(detailedLogData, null, 2)
      );
      console.log(`目录 ${path.basename(dir)} 的详细日志已写入: ${path.relative(process.cwd(), detailedScanLogFile)}`);
    }
    
    // 如果是调试模式，写入错误记录
    if (config.logLevel === 'debug' && results.errors.length > 0) {
      const errorLogFile = getErrorLogFileForDir(dir);
      fs.writeFileSync(
        errorLogFile,
        JSON.stringify(results.errors, null, 2)
      );
      console.log(`目录 ${path.basename(dir)} 的错误日志已写入: ${path.relative(process.cwd(), errorLogFile)}`);
    }
    
    // 写入提取的文本 - 转换为键值对格式
    const extractedTextsFile = getExtractedTextsFileForDir(dir);
    const dirName = path.basename(dir);
    
    // 将文本数组转换为键值对对象
    const textsArray = Array.from(results.texts).sort();
    const textsObject = {};
    
    // 为每个文本生成唯一键名：目录名+0001递增
    textsArray.forEach((text, index) => {
      // 生成键名，例如：homepage0001, homepage0002, ...
      const keyId = String(index + 1).padStart(4, '0');
      const key = `${dirName}${keyId}`;
      textsObject[key] = text;
    });
    
    fs.writeFileSync(
      extractedTextsFile,
      JSON.stringify(textsObject, null, 2)
    );
    console.log(`目录 ${dirName} 的提取文本已写入: ${path.relative(process.cwd(), extractedTextsFile)}`);
    
    // 显示输出路径
    console.log(`目录 ${path.basename(dir)} 的所有输出文件已保存到: ${outputSubDir}`);
    
    // 如果有错误文件，显示错误文件列表
    if (results.errorFiles.length > 0) {
      console.log(`\n目录 ${path.basename(dir)} 处理过程中出现错误的文件 (${results.errorFiles.length}):`);
      results.errorFiles.forEach((file, index) => {
        if (index < 5) {
          console.log(`- ${file}`);
        } else if (index === 5) {
          console.log(`... 以及其他 ${results.errorFiles.length - 5} 个文件`);
        }
      });
    }
  } catch (err) {
    console.error(`写入目录 ${path.basename(dir)} 的日志文件失败:`, err);
  }
}

// 判断是否应该提取文本
function shouldExtract(text) {
  // 基本检查：长度至少2个字符且不在排除列表中
  if (text.length < 2 || config.excludeTexts.includes(text)) {
    return false;
  }
  
  // 检查是否包含可提取的内容：字母、中文、数字或常见标点
  return /[\p{L}\p{N}]/u.test(text) ||  // Unicode字母或数字
         /[\u4e00-\u9fa5]/.test(text) || // 中文字符
         /[,.!?;:]/.test(text);          // 常见标点
}

// 判断是否应该处理文件
function shouldProcessFile(filePath) {
  const ext = path.extname(filePath);
  const filename = path.basename(filePath);
  
  return config.extensions.includes(ext) && 
         !config.excludeFiles.some(pattern => 
           filename.match(new RegExp(pattern.replace('*', '.*')))
         );
}

// 判断是否应该跳过目录
function shouldSkipDir(dirPath) {
  return config.excludeDirs.some(excludeDir => 
    dirPath.includes(path.sep + excludeDir + path.sep) ||
    dirPath.endsWith(path.sep + excludeDir)
  );
}

// 导出配置和函数，以便其他脚本可以导入
module.exports = {
  config,
  extractFromProject,
  processDirectory,
  processFile,
  extractTextsFromAST,
  writeLogFile,
  writeLogFileForDir,
  ensureOutputDirExists,
  ensureOutputDirForDir,
  getOutputSubDirForDir,
  getOutputPathForDir
};

// 如果直接运行此脚本，则启动提取
if (require.main === module) {
  extractFromProject().catch(console.error);
}