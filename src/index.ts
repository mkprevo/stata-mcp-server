#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 타입 정의
interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
}

interface StataExecutionResult {
  success: boolean;
  output: string;
  logPath: string;
}

interface EditParams {
  name?: string;
  definition?: string;
  label?: string;
  type?: string;
  specification?: string;
  section?: string;
  content?: string;
  position?: 'before' | 'after';
}

type SectionName = 'setup' | 'data' | 'preprocessing' | 'descriptive' | 'analysis' | 'output';

// 파일 관리자 클래스
class FileManager {
  private workspaceDir: string;
  private backupsDir: string;
  
  constructor() {
    this.workspaceDir = process.env.STATA_WORKSPACE || process.cwd();
    this.backupsDir = path.join(this.workspaceDir, '.stata-backups');
    this.ensureDirectories();
  }
  
  private async ensureDirectories() {
    try {
      await fs.mkdir(this.backupsDir, { recursive: true });
    } catch (error) {
      console.error('디렉토리 생성 실패:', error);
    }
  }
  
  async resolvePath(filePath: string): Promise<string> {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.workspaceDir, filePath);
  }
  
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  async readFile(filePath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
    return await fs.readFile(resolvedPath, 'utf-8');
  }
  
  async writeFile(filePath: string, content: string): Promise<void> {
    const resolvedPath = await this.resolvePath(filePath);
    await fs.writeFile(resolvedPath, content, 'utf-8');
  }
  
  async createBackup(filePath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = path.basename(resolvedPath);
    const backupPath = path.join(this.backupsDir, `${fileName}.${timestamp}.bak`);
    
    await fs.copyFile(resolvedPath, backupPath);
    return backupPath;
  }
  
  async listDoFiles(directory?: string): Promise<FileInfo[]> {
    const searchDir = directory ? await this.resolvePath(directory) : this.workspaceDir;
    const entries = await fs.readdir(searchDir, { withFileTypes: true });
    
    const doFiles: FileInfo[] = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.do')) {
        const filePath = path.join(searchDir, entry.name);
        const stats = await fs.stat(filePath);
        doFiles.push({
          name: entry.name,
          path: filePath,
          size: stats.size,
          modified: stats.mtime
        });
      }
    }
    
    return doFiles.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }
}

// Do 파일 편집기 클래스
class DoFileEditor {
  private fileManager: FileManager;
  
  constructor(fileManager: FileManager) {
    this.fileManager = fileManager;
  }
  
  async generateDoFile(description: string, outputPath: string): Promise<string> {
    const template = `/*******************************************************************************
* 프로젝트: ${description}
* 작성일: ${new Date().toLocaleDateString('ko-KR')}
* 작성자: Stata MCP Server (LLM Generated)
* 목적: ${description}
*******************************************************************************/

* 초기 설정
clear all
set more off
capture log close
log using "${path.basename(outputPath, '.do')}.log", replace

* 작업 디렉토리 설정
cd "${path.dirname(outputPath)}"

* 데이터 로드
* use "your_data.dta", clear

* 데이터 확인
describe
summarize

* 변수 생성 및 전처리
* generate new_var = .
* replace new_var = .

* 기술통계
* tabulate var1
* summarize var2, detail

* 주요 분석
* regress y x1 x2 x3

* 결과 저장
* outreg2 using "results.doc", replace

* 그래프 생성
* graph twoway scatter y x
* graph export "figure1.png", replace

log close
exit
`;
    
    await this.fileManager.writeFile(outputPath, template);
    return outputPath;
  }
  
  async insertSection(filePath: string, sectionName: SectionName, content: string, position: 'before' | 'after' = 'after'): Promise<void> {
    const currentContent = await this.fileManager.readFile(filePath);
    const lines = currentContent.split('\n');
    
    const sectionMarkers: Record<SectionName, RegExp> = {
      'setup': /\*\s*초기 설정/i,
      'data': /\*\s*데이터 로드/i,
      'preprocessing': /\*\s*변수 생성|전처리/i,
      'descriptive': /\*\s*기술통계/i,
      'analysis': /\*\s*주요 분석/i,
      'output': /\*\s*결과 저장/i
    };
    
    const marker = sectionMarkers[sectionName];
    if (!marker) {
      throw new Error(`알 수 없는 섹션: ${sectionName}`);
    }
    
    const markerIndex = lines.findIndex(line => marker.test(line));
    if (markerIndex === -1) {
      throw new Error(`섹션을 찾을 수 없습니다: ${sectionName}`);
    }
    
    let insertIndex = markerIndex;
    if (position === 'after') {
      insertIndex = markerIndex + 1;
      while (insertIndex < lines.length && !lines[insertIndex].startsWith('*')) {
        insertIndex++;
      }
    }
    
    lines.splice(insertIndex, 0, '', content, '');
    await this.fileManager.writeFile(filePath, lines.join('\n'));
  }
  
  async addVariable(filePath: string, varName: string, definition: string, label?: string): Promise<void> {
    const varCode = `* 변수 생성: ${varName}
${definition}
${label ? `label variable ${varName} "${label}"` : ''}`;
    
    await this.insertSection(filePath, 'preprocessing', varCode);
  }
  
  async addAnalysis(filePath: string, analysisType: string, specification: string): Promise<void> {
    const analysisCode = `* ${analysisType} 분석
${specification}`;
    
    await this.insertSection(filePath, 'analysis', analysisCode);
  }
}

// Stata 실행기 클래스 (macOS 지원)
class StataExecutor {
  private stataPath: string;
  
  constructor() {
    this.stataPath = process.env.STATA_PATH || this.findStataPath();
  }
  
  private findStataPath(): string {
    const platform = os.platform();
    
    if (platform === 'darwin') {
      // macOS Stata 경로들
      const macPaths = [
        '/Applications/Stata/StataBE.app/Contents/MacOS/StataBE',
        '/Applications/Stata/StataSE.app/Contents/MacOS/StataSE',
        '/Applications/Stata/StataMP.app/Contents/MacOS/StataMP',
        '/Applications/Stata 18/StataBE.app/Contents/MacOS/StataBE',
        '/Applications/Stata 17/StataBE.app/Contents/MacOS/StataBE',
        '/Applications/Stata 16/StataBE.app/Contents/MacOS/StataBE'
      ];
      
      return macPaths[0];
    } else if (platform === 'win32') {
      // Windows Stata 경로들
      const winPaths = [
        'C:\\Program Files\\Stata18\\StataMP-64.exe',
        'C:\\Program Files\\Stata17\\StataMP-64.exe',
        'C:\\Program Files\\Stata16\\StataMP-64.exe'
      ];
      return winPaths[0];
    } else {
      // Linux
      return '/usr/local/stata/stata';
    }
  }
  
  async executeDoFile(doFilePath: string): Promise<StataExecutionResult> {
    return new Promise((resolve, reject) => {
      const logPath = doFilePath.replace('.do', '.log');
      const platform = os.platform();
      
      let args;
      if (platform === 'darwin') {
        // macOS는 -b 옵션 사용 (batch mode)
        args = ['-b', 'do', doFilePath];
      } else {
        // Windows는 /e 옵션 사용
        args = ['/e', 'do', doFilePath];
      }
      
      const stataProcess = spawn(this.stataPath, args, {
        cwd: path.dirname(doFilePath)
      });
      
      let output = '';
      let errorOutput = '';
      
      stataProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      stataProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      stataProcess.on('close', async (code) => {
        try {
          const logContent = await fs.readFile(logPath, 'utf-8');
          resolve({
            success: code === 0,
            output: logContent || output || errorOutput,
            logPath
          });
        } catch (error) {
          resolve({
            success: false,
            output: errorOutput || `실행 오류: ${error instanceof Error ? error.message : String(error)}`,
            logPath
          });
        }
      });
      
      stataProcess.on('error', (error) => {
        reject(new Error(`Stata 실행 실패: ${error.message}`));
      });
    });
  }
  
  async executeSelectedLines(filePath: string, startLine: number, endLine: number): Promise<StataExecutionResult> {
    try {
      // 원본 파일 읽기
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // 라인 번호 검증 (1-based index)
      if (startLine < 1 || endLine < 1 || startLine > lines.length || endLine > lines.length) {
        throw new Error(`잘못된 라인 번호: ${startLine}-${endLine} (파일은 1-${lines.length} 라인)`);
      }
      
      if (startLine > endLine) {
        throw new Error(`시작 라인(${startLine})이 끝 라인(${endLine})보다 큽니다`);
      }
      
      // 선택된 라인들 추출 (1-based to 0-based)
      const selectedLines = lines.slice(startLine - 1, endLine);
      
      // 임시 do 파일 생성
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const tempFileName = `temp_${path.basename(filePath, '.do')}_lines_${startLine}_${endLine}_${timestamp}.do`;
      const tempFilePath = path.join(path.dirname(filePath), tempFileName);
      
      // 실행 가능한 코드로 변환
      const executableContent = this.prepareExecutableCode(selectedLines, filePath, startLine, endLine);
      
      // 임시 파일 작성
      await fs.writeFile(tempFilePath, executableContent, 'utf-8');
      
      try {
        // 임시 파일 실행
        const result = await this.executeDoFile(tempFilePath);
        
        // 결과에 원본 정보 추가
        const enhancedOutput = `선택된 라인 실행 결과:\n파일: ${filePath}\n라인: ${startLine}-${endLine}\n\n${result.output}`;
        
        return {
          ...result,
          output: enhancedOutput
        };
      } finally {
        // 임시 파일 정리
        try {
          await fs.unlink(tempFilePath);
          // 임시 로그 파일도 정리
          const tempLogPath = tempFilePath.replace('.do', '.log');
          await fs.unlink(tempLogPath).catch(() => {});
        } catch (error) {
          console.error('임시 파일 정리 실패:', error);
        }
      }
    } catch (error) {
      throw new Error(`선택된 라인 실행 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  private prepareExecutableCode(selectedLines: string[], originalFilePath: string, startLine: number, endLine: number): string {
    const header = `/*******************************************************************************
* 선택된 라인 실행
* 원본 파일: ${originalFilePath}
* 실행 라인: ${startLine}-${endLine}
* 생성 시간: ${new Date().toLocaleString('ko-KR')}
*******************************************************************************/

`;
    
    // 기본 설정 추가 (선택된 코드가 clear all을 포함하지 않는 경우)
    const hasSetup = selectedLines.some(line => 
      /^\s*(clear\s+all|set\s+more\s+off|capture\s+log\s+close)/i.test(line)
    );
    
    let setupCode = '';
    if (!hasSetup) {
      setupCode = `* 기본 설정\nset more off\ncapture log close\n\n`;
    }
    
    // 선택된 라인들 처리
    const processedLines = selectedLines.map((line, index) => {
      const lineNumber = startLine + index;
      // 주석으로 원본 라인 번호 추가
      return `* Line ${lineNumber}\n${line}`;
    }).join('\n');
    
    return header + setupCode + processedLines + '\n\n* 선택된 라인 실행 완료\nexit\n';
  }
}

// MCP 서버 초기화
const fileManager = new FileManager();
const editor = new DoFileEditor(fileManager);
const executor = new StataExecutor();

const server = new Server(
  {
    name: 'stata-mcp-server',
    version: '1.0.0',
    description: 'Stata do 파일 관리 및 실행을 위한 MCP 서버'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// 도구 정의
const tools = [
  {
    name: 'browse_do_files',
    description: '지정된 디렉토리의 do 파일 목록 조회',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { 
          type: 'string', 
          description: '검색할 디렉토리 경로 (기본값: 현재 작업 디렉토리)' 
        }
      }
    }
  },
  {
    name: 'read_do_file',
    description: '로컬 컴퓨터의 do 파일 읽기',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { 
          type: 'string', 
          description: '읽을 do 파일의 경로 (절대 경로 또는 상대 경로)' 
        }
      },
      required: ['file_path']
    }
  },
  {
    name: 'write_do_file',
    description: 'do 파일 생성 또는 덮어쓰기',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '저장할 파일 경로' },
        content: { type: 'string', description: 'do 파일 내용' },
        create_backup: { 
          type: 'boolean', 
          default: true, 
          description: '기존 파일이 있을 경우 백업 생성 여부' 
        }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'edit_do_file',
    description: 'do 파일의 특정 부분 편집',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        operation: {
          type: 'string',
          enum: ['add_variable', 'add_analysis', 'insert_section'],
          description: '수행할 편집 작업'
        },
        params: {
          type: 'object',
          description: '작업별 매개변수'
        }
      },
      required: ['file_path', 'operation', 'params']
    }
  },
  {
    name: 'generate_do_template',
    description: 'LLM을 활용한 do 파일 템플릿 생성',
    inputSchema: {
      type: 'object',
      properties: {
        description: { 
          type: 'string', 
          description: '수행하려는 분석 설명' 
        },
        output_path: { 
          type: 'string', 
          description: '생성할 do 파일 경로' 
        }
      },
      required: ['description', 'output_path']
    }
  },
  {
    name: 'run_do_file',
    description: 'Stata에서 do 파일 실행',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { 
          type: 'string', 
          description: '실행할 do 파일 경로' 
        }
      },
      required: ['file_path']
    }
  },
  {
    name: 'run_do_selected_lines',
    description: 'do 파일의 선택된 라인들만 실행',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '실행할 do 파일 경로'
        },
        start_line: {
          type: 'number',
          description: '시작 라인 번호 (1부터 시작)'
        },
        end_line: {
          type: 'number',
          description: '끝 라인 번호 (포함)'
        }
      },
      required: ['file_path', 'start_line', 'end_line']
    }
  }
];

// 도구 핸들러 구현
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'browse_do_files': {
        const directory = args?.directory as string | undefined;
        const files = await fileManager.listDoFiles(directory);
        const fileList = files.map(f => 
          `${f.name} (${(f.size / 1024).toFixed(1)}KB, 수정: ${f.modified.toLocaleDateString('ko-KR')})`
        ).join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Do 파일 목록 (${directory || '현재 디렉토리'}):\n\n${fileList || '파일 없음'}`
            }
          ]
        };
      }
      
      case 'read_do_file': {
        const filePath = args?.file_path as string;
        if (!filePath) {
          throw new Error('file_path가 필요합니다');
        }
        
        const content = await fileManager.readFile(filePath);
        const resolvedPath = await fileManager.resolvePath(filePath);
        
        return {
          content: [
            {
              type: 'text',
              text: `파일: ${resolvedPath}\n${'='.repeat(80)}\n${content}`
            }
          ]
        };
      }
      
      case 'write_do_file': {
        const filePath = args?.file_path as string;
        const content = args?.content as string;
        const createBackup = args?.create_backup as boolean ?? true;
        
        if (!filePath || !content) {
          throw new Error('file_path와 content가 필요합니다');
        }
        
        const resolvedPath = await fileManager.resolvePath(filePath);
        
        if (createBackup && await fileManager.fileExists(resolvedPath)) {
          const backupPath = await fileManager.createBackup(filePath);
          console.log(`백업 생성됨: ${backupPath}`);
        }
        
        await fileManager.writeFile(filePath, content);
        
        return {
          content: [
            {
              type: 'text',
              text: `파일이 저장되었습니다: ${resolvedPath}`
            }
          ]
        };
      }
      
      case 'edit_do_file': {
        if (!args) {
          throw new Error('매개변수가 필요합니다');
        }
        
        const filePath = args.file_path as string;
        const operation = args.operation as string;
        const params = args.params as EditParams;
        
        if (!filePath || !operation || !params) {
          throw new Error('file_path, operation, params가 필요합니다');
        }
        
        await fileManager.createBackup(filePath);
        
        switch (operation) {
          case 'add_variable':
            if (!params.name || !params.definition) {
              throw new Error('변수명과 정의가 필요합니다');
            }
            await editor.addVariable(
              filePath, 
              params.name, 
              params.definition, 
              params.label
            );
            break;
            
          case 'add_analysis':
            if (!params.type || !params.specification) {
              throw new Error('분석 유형과 명세가 필요합니다');
            }
            await editor.addAnalysis(
              filePath,
              params.type,
              params.specification
            );
            break;
            
          case 'insert_section':
            if (!params.section || !params.content) {
              throw new Error('섹션명과 내용이 필요합니다');
            }
            await editor.insertSection(
              filePath,
              params.section as SectionName,
              params.content,
              params.position
            );
            break;
        }
        
        const updatedContent = await fileManager.readFile(filePath);
        
        return {
          content: [
            {
              type: 'text',
              text: `파일이 수정되었습니다.\n\n수정된 내용:\n${'='.repeat(80)}\n${updatedContent}`
            }
          ]
        };
      }
      
      case 'generate_do_template': {
        const description = args?.description as string;
        const outputPath = args?.output_path as string;
        
        if (!description || !outputPath) {
          throw new Error('description과 output_path가 필요합니다');
        }
        
        const createdPath = await editor.generateDoFile(description, outputPath);
        const content = await fileManager.readFile(createdPath);
        
        return {
          content: [
            {
              type: 'text',
              text: `Do 파일 템플릿이 생성되었습니다: ${createdPath}\n\n내용:\n${'='.repeat(80)}\n${content}`
            }
          ]
        };
      }
      
      case 'run_do_file': {
        const filePath = args?.file_path as string;
        if (!filePath) {
          throw new Error('file_path가 필요합니다');
        }
        
        const resolvedPath = await fileManager.resolvePath(filePath);
        const result = await executor.executeDoFile(resolvedPath);
        
        return {
          content: [
            {
              type: 'text',
              text: `실행 ${result.success ? '성공' : '실패'}\n로그 파일: ${result.logPath}\n\n출력:\n${'='.repeat(80)}\n${result.output}`
            }
          ]
        };
      }
      
      case 'run_do_selected_lines': {
        const filePath = args?.file_path as string;
        const startLine = args?.start_line as number;
        const endLine = args?.end_line as number;
        
        if (!filePath) {
          throw new Error('file_path가 필요합니다');
        }
        if (typeof startLine !== 'number' || typeof endLine !== 'number') {
          throw new Error('start_line과 end_line이 필요합니다');
        }
        
        const resolvedPath = await fileManager.resolvePath(filePath);
        const result = await executor.executeSelectedLines(resolvedPath, startLine, endLine);
        
        return {
          content: [
            {
              type: 'text',
              text: `선택된 라인 실행 ${result.success ? '성공' : '실패'}\n로그 파일: ${result.logPath}\n\n출력:\n${'='.repeat(80)}\n${result.output}`
            }
          ]
        };
      }
      
      default:
        throw new Error(`알 수 없는 도구: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `오류 발생: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
});

// 서버 시작
const transport = new StdioServerTransport();
server.connect(transport);

console.error('Stata MCP Server 시작됨...');