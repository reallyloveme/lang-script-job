# 国际化文本提取工具

这个工具用于从 JavaScript/TypeScript 项目中提取需要国际化的文本。它使用 AST（抽象语法树）分析来识别和提取代码中的文本，支持多目录扫描，每个目录都有独立的输出结果。

## 功能特点

- 支持扫描多个目录，每个目录有独立的输出结果
- 支持 JavaScript、TypeScript、JSX 和 TSX 文件
- 可以提取 JSX 文本、对象属性、函数调用参数和 JSX 属性中的文本
- 可配置的目标属性名和函数名
- 详细的日志记录，包括每个文件的处理结果
- 通过配置文件自定义扫描行为

## 安装依赖

```bash
npm install @babel/parser @babel/traverse @babel/types
```

## 使用方法

### 基本用法

```bash
node scanByast.js
```

### 配置文件

你可以在项目根目录创建 `i18n.config.json` 文件来自定义扫描行为。配置文件中的设置会覆盖默认配置。

示例配置文件：

```json
{
  "scanDirs": [
    "src/pages/homepage",
    "src/pages/employee",
    "src/components/common"
  ],
  "extensions": [".ts", ".tsx", ".js", ".jsx"],
  "excludeDirs": ["node_modules", ".next", "build", "dist", "tests"],
  "excludeFiles": ["*.test.*", "*.spec.*", "*.d.ts", "*.mock.*"],
  "targetProps": [
    "name", 
    "label", 
    "title", 
    "emptyText", 
    "tooltip", 
    "placeholder",
    "description",
    "buttonText"
  ],
  "targetFunctions": ["titleShow", "t", "i18n", "translate"],
  "excludeTexts": ["N/A", "OK", "Cancel"],
  "outputDir": "i18n-output",
  "logLevel": "detailed"
}
```

### 配置选项

| 选项 | 类型 | 描述 | 默认值 |
|------|------|------|--------|
| `scanDirs` | 数组 | 要扫描的目录列表（相对或绝对路径） | `["src/pages/homepage", "src/pages/employee"]` |
| `extensions` | 数组 | 要处理的文件扩展名 | `[".ts", ".tsx", ".js", ".jsx"]` |
| `excludeDirs` | 数组 | 要排除的目录名 | `["node_modules", ".next", "build", "dist"]` |
| `excludeFiles` | 数组 | 要排除的文件模式（支持通配符） | `["*.test.*", "*.spec.*", "*.d.ts"]` |
| `targetProps` | 数组 | 要提取文本的属性名 | `["name", "label", "title", "emptyText", "tooltip", "placeholder"]` |
| `targetFunctions` | 数组 | 要提取参数的函数名 | `["titleShow", "t", "i18n"]` |
| `excludeTexts` | 数组 | 要排除的文本 | `[]` |
| `outputDir` | 字符串 | 输出目录（相对或绝对路径） | `"i18n-output"` |
| `logLevel` | 字符串 | 日志级别（"basic", "detailed", "debug"） | `"detailed"` |

## 输出结果

每个扫描目录都会在输出目录下创建一个子目录，子目录名称基于扫描目录的名称。例如，如果扫描 `src/pages/homepage`，则输出子目录为 `i18n-output/homepage`。

每个输出子目录包含以下文件：

- `scan_log.json`: 主日志文件，包含扫描配置和摘要
- `detailed_scan_log.json`: 详细的扫描日志，包含每个文件的处理结果
- `extracted-texts.json`: 提取的文本列表
- `file_scan_log.json`: 每个文件的扫描记录
- `scan_errors.json`: 错误记录（仅在 debug 模式下生成）

## 作为模块使用

你也可以在其他脚本中导入并使用这个工具：

```javascript
const scanner = require('./scanByast');

// 修改配置
scanner.config.scanDirs = [
  '/path/to/your/directory'
];

// 启动扫描
scanner.extractFromProject().catch(console.error);
```

## 测试

提供了一个测试脚本 `test-multi-dir.js`，用于验证多目录扫描功能：

```bash
node test-multi-dir.js
```

要保留测试环境以供检查，可以使用 `--keep` 参数：

```bash
node test-multi-dir.js --keep
```