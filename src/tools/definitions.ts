/**
 * Tool JSON schemas exposed to the GLM model.
 *
 * These definitions follow the OpenAI function-calling format and map
 * directly to ToolExecutor implementations. Local file and shell tools run in
 * the agent process; writes and command execution still ask the ACP client for
 * permission before doing anything.
 */

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the text content of a file from the agent process. Relative paths resolve against the ACP session working directory. Large responses are truncated: pass offset (1-based start line) and limit (max lines, default 2000) to page through; the result reports the shown range and the total line count.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative path to the file to read.",
          },
          offset: {
            type: "number",
            description: "1-based line number to start reading from. Default 1.",
          },
          limit: {
            type: "number",
            description: "Maximum number of lines to return. Default 2000.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write a text file from the agent process after asking the user for permission. Relative paths resolve against the ACP session working directory. Creating a new file needs no extra arguments; replacing an existing file requires overwrite: true (prefer edit_file for surgical changes).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative path to the file to write.",
          },
          content: {
            type: "string",
            description: "The full text content to write to the file.",
          },
          overwrite: {
            type: "boolean",
            description: "Pass true to replace the full content of an existing file (a deliberate full rewrite). Omit it when creating a new file — passing it for a file that does not exist fails.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Edit an existing text file with a surgical find-and-replace after asking the user for permission. old_string must match the file's current content exactly: if it is not found (the file may have changed since you read it — re-read it) or matches more than once (include more surrounding lines, or pass replace_all) the edit fails and the file is left untouched. Prefer this over write_file for existing files; use write_file only for new files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative path to the file to edit.",
          },
          old_string: {
            type: "string",
            description: "The exact current text to replace. Must match the file as it exists on disk right now.",
          },
          new_string: {
            type: "string",
            description: "The replacement text. Pass an empty string to delete the matched text.",
          },
          replace_all: {
            type: "boolean",
            description: "Replace every occurrence of old_string instead of failing on multiple matches. Default false.",
          },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List the files and directories at the given path from the agent process. Relative paths resolve against the ACP session working directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative path of the directory to list.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Execute a shell command via `sh -c` in the ACP session working directory and return stdout, stderr, and exit code. The user is asked for permission before each invocation.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description:
              "The shell command line to execute (interpreted by `sh -c`, so quoting, pipes, and redirects all work).",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web using Z.AI's premium search engine and return relevant results, including titles, URLs, sources, dates, and content summaries.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query.",
          },
          count: {
            type: "integer",
            description: "Number of results to return (1–50). Default is 10.",
            minimum: 1,
            maximum: 50,
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_reader",
      description:
        "Fetch and parse the content of a web page at the given URL via Z.AI's reader, returning the main text content as markdown or plain text.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL of the page to read.",
          },
          return_format: {
            type: "string",
            description: "Return format: 'markdown' (default) or 'text'.",
            enum: ["markdown", "text"],
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_analysis",
      description:
        "Analyze an image (local file path or remote URL) using Z.AI Coding Plan Vision MCP. Returns a textual description / answer. Use this to extract text from screenshots, describe diagrams, or answer questions about images the user has referenced.",
      parameters: {
        type: "object",
        properties: {
          image_source: {
            type: "string",
            description: "Local file path or remote URL of the image to analyze.",
          },
          prompt: {
            type: "string",
            description: "Optional question or instruction guiding the analysis. Defaults to a general description.",
          },
        },
        required: ["image_source"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todowrite",
      description:
        "Create or replace the session's structured task list. Use it for multi-step work so progress is tracked in the task list instead of narrated in text; skip it for single-step, trivial, or purely conversational requests. Keep exactly one task list: each call replaces the previous one entirely. Mark a task in_progress before starting it and completed as soon as it is done — never batch status updates after the fact.",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            description: "The full task list, replacing any previous one.",
            items: {
              type: "object",
              properties: {
                content: {
                  type: "string",
                  description: "Short imperative description of the task.",
                },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed"],
                  description: "pending = not started, in_progress = currently working on it, completed = done.",
                },
                active_form: {
                  type: "string",
                  description: "Present-progressive form shown while the task runs, e.g. 'Renaming the entry point'.",
                },
              },
              required: ["content", "status"],
            },
          },
        },
        required: ["todos"],
      },
    },
  },
];
