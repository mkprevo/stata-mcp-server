# Stata MCP Server (macOS)

A Model Context Protocol (MCP) server for managing and running Stata .do files that integrates with Claude Desktop.

## Features

### 📁 File management
- **BROOK_Do_FILES**: Get a list of .do files in a directory
- READ_FILE**: Read a .do file
- WRITE_FILE**: Create or overwrite a .do file (supports automatic backup)

### ✏️ Edit a file
- EDIT_FILE**: Edit a specific section of a .do file
  - Add a variable (`add_variable`)
  - Add analysis code (`add_analysis`) 
  - Insert a custom section (`insert_section`)

### 🚀 Automation.
- generate_do_template**: Generate a .do file template using AI
- run_do_file**: Run a .do file in Stata (macOS support)
- run_do_selected_lines**: Run only selected lines ⭐ NEW!

## Installation complete ✅

The installation is complete with the following configuration:

- **project path**: `/users/username/projects/stata-mcp-server`
- **Stata path**: `/Applications/Stata/StataBE.app/Contents/MacOS/StataBE`
- Working directory**: `/Users/username/Documents/Stata`
- Cloud Desktop Settings**: `/Users/username/Library/Application Support/Claude/claude_desktop_config.json`

## How to use it.

### 1. Restart Claude Desktop
Completely shut down and restart Claude Desktop.

### 2. Enable in Claude Desktop

```
"Read the test.do file and show me"

"Create a do file that analyzes the relationship between education and income"

"Show me a list of all do files in the current directory"

"Add a logistic regression to the analysis.do file"

"Run only lines 10 through 15 of the test_sample.do file"

"Run only the regression part of the regression.do file separately"
```

### 3. Run selected lines ⭐

You can now select and run only certain lines of a do file:

```
"Run only lines 5 through 10 of the analysis.do file"
"Run only the data load part (lines 8-12) to test"
```

This function works as follows
1. extracts the specified line range
2. creates a temporary .do file (automatically adding the necessary settings)
3. run the temporary file in Stata
4. clean up the temporary file after returning results

## Do file template structure.

```stata
/*******************************************************************************
* Project: [Analysis Description]
* Created: [Current Date]
* Author: Stata MCP Server (LLM generation)]
* Purpose: [Analysis Purpose] [Analysis Purpose
*******************************************************************************/

* Initial Setup
Clear all
More settings
Close capture logs
Log using "logfile.log", replace

* Load data
* Use "your_data.dta", clear

* Verify data
描述
summarize

* Create and preprocess variables
* generate new_var = .

* descriptive statistics
* tabulate var1

* main analysis
* regress Y X1 X2 X3

* save results
"results.doc" with * outreg2, replace

Close the log
exit
```

## Testing

Verify that the server is working properly:

```bash
cd /users/username/projects/stata-mcp-server
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js
```

## Backup system

- Create automatic backups when files are modified
- Backup location: `$STATA_WORKSPACE/.stata-backups/`
- Format: Filename: `filename.do.YYYY-MM-DDTHH-MM-SS-sssZ.bak`

## Troubleshooting

### Common issues

1. **Not recognized by Cloud Desktop** 1.
   - Restart Cloud Desktop completely
   - Check configuration file path: `/users/username/library/application support/Claude/claude_desktop_config.json`

2. **Stata fails to run
   - Check Stata path: `/Applications/Stata/StataBE.app/Contents/MacOS/StataBE`
   - Check Stata license

3. **Permissions error
   - Check Documents/Stata directory permissions
   - Check file read/write permissions

### Check the log

```bash
# Server logs
cd /users/username/project/stata-mcp-server
node dist/index.js 2> server.log

# Stata execution log
# .log files are generated with each .do file
```

## Develop

### Script
```bash
npm run build # compile typescript
npm run dev # Development mode (watch)
npm run start # Start the server
npm run clean # Clean build files
```

## Environment variables

- STATA_PATH**: Stata executable path
- STATA_WORKSPACE**: Stata working directory

## License

MIT License.

---.

**Created by the Sociology of Science Research Team ❤️ ** **

**Congratulations on your Stata MCP server installation!** 🎉 .

Restart the Claude desktop and try it out.