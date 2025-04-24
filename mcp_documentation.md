# Using MCP Servers in the ChatGPT VSCode Extension

This extension supports integration with external MCP (Model Context Protocol) servers, allowing you to leverage additional tools and resources directly from within VSCode.

## How to Add an MCP Server

1. **Open VSCode Settings**  
   Go to your VSCode settings (File → Preferences → Settings), and search for `chatgpt.mcpServers`.

2. **Edit the MCP Servers Configuration**  
   The `chatgpt.mcpServers` setting is an object where each key is a server name, and the value is an object describing how to launch the MCP server.  
   Each server entry should include:
   - `command`: The executable to run (e.g., `node`)
   - `args`: An array of arguments (e.g., the path to the server's entrypoint script)
   - `env`: (Optional) An object of environment variables required by the server

3. **Example: Adding the context7 MCP Server**

Suppose you have a context7 MCP server installed and want to add it.  
Assume the entrypoint is at `/Users/youruser/MCP/context7-server/build/index.js` and it requires an API key.

```json
{
  "chatgpt.mcpServers": {
    "context7": {
      "command": "node",
      "args": ["/Users/youruser/MCP/context7-server/build/index.js"],
      "env": {
        "CONTEXT7_API_KEY": "your-context7-api-key"
      }
    }
  }
}
```

- Replace `/Users/youruser/MCP/context7-server/build/index.js` with the actual path to your context7 server's entrypoint.
- Replace `"your-context7-api-key"` with your actual API key or any required environment variables.

4. **Save and Reload**  
   After saving your settings, reload VSCode. The extension will automatically start the configured MCP servers and connect to them.

5. **Selecting MCP Servers in a Chat Session**  
   You can select which MCP servers to use for the current session by running the command:

   - Open the Command Palette (`Cmd`/`Ctrl` + `Shift` + `P`)
   - Type and select **ChatGPT: Select MCP Servers**
   - Check or uncheck the MCP servers you want to enable for this session
   - Click OK. Your selection will be confirmed with an information message.

   The selection is stored in memory for the current session.

## Troubleshooting

- Ensure the path to the server entrypoint is correct and executable.
- Make sure all required environment variables (such as API keys) are provided.
- Check the VSCode Output panel for logs if a server fails to start.

## More Information

For more details on MCP servers and the protocol, see the [Model Context Protocol documentation](https://github.com/modelcontextprotocol/spec).
