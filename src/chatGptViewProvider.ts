import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import OpenAI from "openai";
import { encodingForModel } from "js-tiktoken";
import { AuthInfo, Settings, Message, Provider, Prompt, UserMessage, BASE_URL } from './types';
import { ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionContentPartText } from 'openai/resources/chat/completions';

export class ChatGPTViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'chatgpt.chatView';
  private _view?: vscode.WebviewView;

  private _conversation?: any;
  private _messages?: Message[];
  private _openai?: OpenAI;

  private _response?: string;
  private _totalNumberOfTokens?: number;
  private _prompt?: string;
  private _fullPrompt?: string;
  private _currentMessageNumber = 0;
  private _enc = encodingForModel("gpt-4"); //Hardcoded for now

  private _settings: Settings = {
    selectedInsideCodeblock: false,
    codeblockWithLanguageId: false,
    pasteOnClick: true,
    keepConversation: true,
    timeoutLength: 60,
    apiUrl: BASE_URL,
    model: 'gpt-3.5-turbo',
    options: {
    },
  };
  private _authInfo?: AuthInfo;

  // MCP integration
  private _mcpClients: { [name: string]: any } = {};
  private _selectedMcpServers: string[] = [];

  public setMcpClients(clients: { [name: string]: any }) {
    this._mcpClients = clients;
  }
  public setSelectedMcpServers(names: string[]) {
    this._selectedMcpServers = names;
  }

  // In the constructor, we store the URI of the extension
  constructor(private readonly _extensionUri: vscode.Uri) {
    this._messages = [];
    this._messages?.push({ role: "system", content: this.getStartSystemPrompt(), selected:true });
    console.log("constructor....");
    console.log("messages:", this._messages);
  }

  // Set the API key and create a new API instance based on this key
  public setAuthenticationInfo(authInfo: AuthInfo) {
    this._authInfo = authInfo;
    this._newAPI();
  }

  public setSettings(settings: Settings) {
    let changeModel = false;
  
    // Check if there are any keys in the options object of the settings
    if (settings.apiUrl || settings.model || (settings.options && Object.keys(settings.options).length > 0)) {
      changeModel = true;
    }
  
    // Update settings with the new values
    this._settings = { ...this._settings, ...settings };
  
    if (changeModel) {
      //this._newAPI();
    }
  }

  public getSettings() {
    return this._settings;
  }

  // This private method initializes a new ChatGPTAPI instance
  private _newAPI() {
    console.log("New API");
    console.log("Messages:", this._messages);
    if (!this._authInfo || !this._settings?.apiUrl) {
      console.warn("API key or API URL not set, please go to extension settings (read README.md for more info)");
    } else {
      console.log("apiUrl:", this._settings?.apiUrl);
      this._openai = new OpenAI(
        {
          apiKey: this._authInfo?.apiKey,
          baseURL: this._authInfo?.apiUrl
        }
      );
    }
    setTimeout(() => {
      const chat_response = this._updateChatMessages(
        this._getMessagesNumberOfTokens(),
        0
      );
      this._view?.webview.postMessage({ type: 'addResponse', value: chat_response });
    }, 2000);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    // set options for the webview, allow scripts
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri
      ]
    };

    // set the HTML for the webview
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // add an event listener for messages received by the webview
    webviewView.webview.onDidReceiveMessage(async data =>  {
      switch (data.type) {
        case 'ready':
          {
            const config = vscode.workspace.getConfiguration('chatgpt');
            let providers: Provider[] = config.get('providers') || [];
            let prompts: Prompt[] = config.get('prompts') || [];
            this.set_providers(providers);
            this.set_prompts(prompts);
            break;
          }
        case 'codeSelected':
          {
            // do nothing if the pasteOnClick option is disabled
            if (!this._settings.pasteOnClick) {
              break;
            }
            let code = data.value;
            const snippet = new vscode.SnippetString();
            snippet.appendText(code);
            // insert the code as a snippet into the active text editor
            vscode.window.activeTextEditor?.insertSnippet(snippet);
            break;
          }
        case 'pasteImage': 
          {
            const base64Data = data.value;
            const imageType = base64Data.substring(base64Data.indexOf(':') + 1, base64Data.indexOf(';'));
            const fileType = imageType.split('/')[1];
            const fileName = `clipboard_image.${fileType}`;
            this.addImageToChat(base64Data, fileName);
            break;
          }
        case 'prompt':
          {
            console.log("prompt");
            this.search(data.value);
            break;
          }
        case 'promptNoQuery':
          {
            console.log("promptNoQuery");

            let searchPrompt = await this._generate_search_prompt(data.value);
            
            this._messages?.push({ role: "user", content: searchPrompt, selected:true })
            let chat_response = this._updateChatMessages(
              this._getMessagesNumberOfTokens(),
              0
            );
            this._response = chat_response;
            this._view?.webview.postMessage({ type: 'addResponse', value: chat_response });
            break;
          }
        case 'checkboxChanged':
          {
            console.log("checkboxChanged:", data);
            const idParts = data.id.split('-'); // Split the id into parts
            if(idParts.length === 3) {
              const indexStr = idParts[2]; // Grab the last part, which should contain the index
              const index = parseInt(indexStr, 10); // Convert the index to an integer and adjust if necessary
            
              if(this._messages && index >= 0 && index < this._messages.length) {
                // If the index is within the bounds of the array, update the checked status
                this._messages[index].selected = data.checked;
              } else {
                // Handle cases where index is out of bounds or _messages is not an array
                console.error('Index is out of bounds or _messages is not properly defined.');
              }
            } else {
              // Handle cases where data.id does not follow the expected format
              console.error('data.id is not in the expected format.');
            }
            break;
          }
        case 'messageContentChanged':
          {
            console.log("messageContentChanged:", data);
            const idParts = data.id.split('-'); // Split the id into parts
            if(idParts.length === 3) {
              const indexStr = idParts[2]; // Grab the last part, which should contain the index
              const index = parseInt(indexStr, 10); // Convert the index to an integer and adjust if necessary
            
              if(this._messages && index >= 0 && index < this._messages.length) {
                // If the index is within the bounds of the array, update the checked status
                this._messages[index].content = data.value;
              } else {
                // Handle cases where index is out of bounds or _messages is not an array
                console.error('Index is out of bounds or _messages is not properly defined.');
              }
            } else {
              // Handle cases where data.id does not follow the expected format
              console.error('data.id is not in the expected format.');
            }
            console.log("messages:", this._messages);
            break;
          }
        case "providerModelChanged":
          {
            const providerIndex = data.providerIndex;
            const modelIndex = data.modelIndex;
            console.log("Provider Changed, providerIndex:", providerIndex, ", model:", modelIndex);

            const config = vscode.workspace.getConfiguration('chatgpt');
            let providers: Provider[] = config.get('providers') || [];
      
            if (providers && providers.length > providerIndex) {
              const provider_data = providers[providerIndex];
              if (provider_data.models && provider_data.models.length > modelIndex) {
                const model_data = provider_data.models[modelIndex];
                const provider_settings = {
                  model: model_data.name,
                  apiUrl: provider_data.apiUrl,
                  apiKey: provider_data.apiKey,
                  options: {
                  ...model_data.options // assuming model_data contains options and it includes maxModelTokens, maxResponseTokens, and temperature
                  },
                };
                this.setSettings({
                  apiUrl: provider_settings.apiUrl,
                  model: provider_settings.model,
                  options: {
                  ...provider_settings.options, // Spread operator to include all keys from options
                  },
                });
                // Put configuration settings into the provider
                this.setAuthenticationInfo({
                  apiKey: provider_settings.apiKey,
                  apiUrl: provider_settings.apiUrl
                });
              }						
            }
            break;
          }
        case "systemPromptChanged":
          {
            const systemPromptIndex = data.systemPromptIndex;
            console.log("systemPrompt Changed, providerIndex:", systemPromptIndex);

            const config = vscode.workspace.getConfiguration('chatgpt');
            let prompts: Prompt[] = config.get('prompts') || [];
      
            if (prompts && prompts.length > systemPromptIndex) {
              const prompt_data = prompts[systemPromptIndex];
              if (prompt_data.name && prompt_data.prompt) {
                this.set_prompt(prompt_data);
              }						
            }
            break;
          }
      }
    });
  }

  public getStartSystemPrompt() {
    const config = vscode.workspace.getConfiguration('chatgpt');
    let prompts: Prompt[] = config.get('prompts') || [];
    let start_system_prompt = "You are a helpful assistant.";
    if (prompts && prompts.length > 0) {
      const prompt_data = prompts[0];
      if (prompt_data.name && prompt_data.prompt) {
        start_system_prompt = prompt_data.prompt;
      }						
    }
    return start_system_prompt;
  }


  public async resetConversation() {
    console.log(this, this._conversation);
    if (this._conversation) {
      this._conversation = null;
    }
    this._prompt = '';
    this._response = '';
    this._fullPrompt = '';
    this._totalNumberOfTokens = 0;
    this._view?.webview.postMessage({ type: 'setPrompt', value: '' });
    this._messages = [];
    
    this._messages?.push({ role: "system", content: this.getStartSystemPrompt(), selected:true });
    const chat_response = this._updateChatMessages(
      this._getMessagesNumberOfTokens(),
      0
    );
    this._view?.webview.postMessage({ type: 'addResponse', value: chat_response });
  }

  public async pasteChat() {
    console.log("pasteChat");
  
    // Ensure there is an active text editor where we can paste the YAML
    if (!vscode.window.activeTextEditor) {
      vscode.window.showErrorMessage('No active text editor!');
      return;
    }
  
    try {
      // Get the original _messages object
      // If you want to exclude any other properties from the YAML, you can map and remove them here
      const messagesForYaml = this._messages?.map(({ role, content, selected }) => ({
        role, content, selected
      }));
  
      // Convert messages to a YAML string
      const messagesYaml = yaml.dump(messagesForYaml, { noRefs: true, lineWidth: -1 });
  
      // Create a new snippet and append the YAML string
      const snippet = new vscode.SnippetString();
      snippet.appendText(messagesYaml);
  
      // Insert the snippet into the active text editor
      await vscode.window.activeTextEditor.insertSnippet(snippet);
  
      console.log("Chat pasted as YAML successfully.");
    } catch (error) {
      console.error("Failed to paste chat as YAML:", error);
      vscode.window.showErrorMessage('Failed to paste chat as YAML: ' + error);
    }
  }
  
  public async useSelectionAsChat() {
    console.log("use selection as chat");

    // Ensure there is an active text editor with a selection
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage('No active text editor with a selection!');
      return;
    }

    const selection = activeEditor.selection;
    if (selection.isEmpty) {
      vscode.window.showErrorMessage('No text selected!');
      return;
    }

    // Get the selected text
    const selectedText = activeEditor.document.getText(selection);

    try {
      // Parse the selected text as YAML
      const parsedMessages = yaml.load(selectedText);

      // Validate the parsed YAML structure
      if (!Array.isArray(parsedMessages)) {
        throw new Error('Selected text is not an array of messages.');
      }

      // Validation of each message in the array
      for (const msg of parsedMessages) {
        if (typeof msg !== 'object' || !('role' in msg) || !('content' in msg) || !('selected' in msg)) {
          throw new Error('Invalid message format. Each message must have role, content, and selected properties.');
        }
      }

      // If valid, update the _messages array with new data
      this._messages = parsedMessages;

      // Update the webview visualization
      const chat_response = this._updateChatMessages(
        this._getMessagesNumberOfTokens(),
        0
      );
      this._view?.webview.postMessage({ type: 'addResponse', value: chat_response });

      console.log("Updated messages from selection successfully.");
    } catch (error) {
      console.error("Failed to use selection as chat:", error);
      vscode.window.showErrorMessage('Failed to use selection as chat: ' + error);
    }
  }

  public fixCodeBlocks(response: string) {
    // Use a regular expression to find all occurrences of the substring in the string
    const REGEX_CODEBLOCK = new RegExp('\`\`\`', 'g');
    const matches = response.match(REGEX_CODEBLOCK);

    // Return the number of occurrences of the substring in the response, check if even
    const count = matches ? matches.length : 0;
    if (count % 2 === 0) {
      return response;
    } else {
      // else append ``` to the end to make the last code block complete
      console.log("Warning - code block not complete");
      return response.concat('\n\`\`\`');
    }

  }

  private _getMessagesNumberOfTokens() {
    
    let full_promt = "";
    if (this._messages) {
      for (const message of this._messages) {
        if (message.selected) {
          full_promt += "\n# <u>" + message.role.toUpperCase() + "</u>:\n" + message.content;
        }
      }
    }

    const tokenList = this._enc.encode(full_promt);
    return tokenList.length;
  }


  
  public getSelectedMessagesWithoutSelectedProperty(): Omit<Message, 'selected'>[] {
    let ret = this._messages?.filter(message => message.selected).map(({ role, content }) => ({
    role, content
    })) || [];
    return ret;
  }

  private _containsCodeBlockOrListItems(content: string): boolean {
    // Regex pattern to match code blocks.
    const codeBlockPattern = /```[\s\S]*?```/;
  
    // Regex pattern to match bullet points or numbered list items.
    const listItemPattern = /^(?:\s*(?:[-*+]|\d+\.)\s+.+)$/m;
  
    // Test if the content contains a code block or list items.
    return codeBlockPattern.test(content) || listItemPattern.test(content);
  }


  private isChatCompletionContentPart(value: any): value is ChatCompletionContentPart {
    return this.isChatCompletionContentPartImage(value);
  }
  
    
  private isChatCompletionContentPartText(value: any): value is ChatCompletionContentPartText {
    return typeof value === 'object'
      && value != null
      && typeof value.text === 'string'
      && value.type === 'text';
  }
  private isChatCompletionContentPartImage(value: any): value is ChatCompletionContentPartImage {
    return typeof value === 'object'
      && value !== null
      && typeof value.image_url === 'object'
      && typeof value.image_url.url === 'string'
      && value.type === 'image_url';
  }
    
  private _updateChatMessages(promtNumberOfTokens:number, completionTokens:number) {
    let chat_response = "";
    if (this._messages) {
      this._messages.forEach((message, index) => {
        const selected = message.selected;
        const checked_string = selected ? "checked" : "";
        if (typeof message.content === 'string') {
          if (this._containsCodeBlockOrListItems(message.content)) {
            chat_response += "\n# <u> <input id='message-checkbox-" + index + "' type='checkbox' " + checked_string + " onchange='myFunction(this)'> " + message.role.toUpperCase() + "</u>:\n" + message.content;
          } else {
            chat_response += "\n# <u> <input id='message-checkbox-" + index + "' type='checkbox' " + checked_string + " onchange='myFunction(this)'> " + message.role.toUpperCase() + "</u>: <div id='message-content-" + index + "' contenteditable='false' onclick='makeEditable(this)' onblur='saveContent(this)'>"+ message.content + "</div>";
          }
        } else if (Array.isArray(message.content)) {
          // Handle the case where message.content is an array of ChatCompletionContentPartImage
          chat_response += "\n# <u> <input id='message-checkbox-" + index + "' type='checkbox' " + checked_string + " onchange='myFunction(this)'> " + message.role.toUpperCase() + "</u>: <div id='message-content-" + index + "' contenteditable='false'>";
          message.content.forEach(part => {
            console.log("processing an object...")
            if (this.isChatCompletionContentPartImage(part)) {
              console.log("Is an image!!!")
              // Process each ChatCompletionContentPartImage item
              chat_response += "<img src='"+ part.image_url.url + "' alt='Base64 Image'/>";
            }
            if (this.isChatCompletionContentPartText(part)) {
              console.log("Is a text!!!")
              chat_response += part.text;
            }
          });
          chat_response += "</div>"
        }
      });
    }
    if (this._totalNumberOfTokens !== undefined) {
      this._totalNumberOfTokens += promtNumberOfTokens + completionTokens;
      chat_response += `\n\n---\n*<sub>Total Tokens: ${this._totalNumberOfTokens},  Tokens used: ${promtNumberOfTokens + completionTokens} (${promtNumberOfTokens}+${completionTokens}), model: ${this._settings.model}</sub>* \n\n---\n\n\n\n\n\n\n`;
    }
    return chat_response;
  }
  
  private async _generate_search_prompt(prompt:string) {
    this._prompt = prompt;
    if (!prompt) {
      prompt = '';
    }

    // Focus the ChatGPT view
    if (!this._view) {
      await vscode.commands.executeCommand('chatgpt.chatView.focus');
    } else {
      this._view?.show?.(true);
    }

    // Initialize response and token count
    
    if (!this._response) {
      this._response = '';
    }
    if (!this._totalNumberOfTokens) {
      this._totalNumberOfTokens = 0;
    }

    // Get selected text and language ID (if applicable)
    const selection = vscode.window.activeTextEditor?.selection;
    const selectedText = vscode.window.activeTextEditor?.document.getText(selection);
    const languageId =
      (this._settings.codeblockWithLanguageId
        ? vscode.window.activeTextEditor?.document?.languageId
        : undefined) || '';

    // Build the search prompt
    let searchPrompt = '';
    if (selection && selectedText) {
      if (this._settings.selectedInsideCodeblock) {
        searchPrompt = `${prompt}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;
      } else {
        searchPrompt = `${prompt}\n${selectedText}\n`;
      }
    } else {
      searchPrompt = prompt;
    }
    this._fullPrompt = searchPrompt;

    // Increment message number and store for tracking
    this._currentMessageNumber++;
    return searchPrompt;

  }

  public set_providers(providers: Provider[]): void {
    this._view?.webview.postMessage({ type: 'initialize', value: providers });
  }

  public set_prompts(prompts: Prompt[]): void {
    console.log("Set Prompts:", prompts);
    this._view?.webview.postMessage({ type: 'initialize_prompts', value: prompts });
  }

  public set_prompt(prompt: Prompt): void {
    // Check if _messages is defined
    if (this._messages) {
      this._messages[0] = { role: "system", content: prompt.prompt, selected: true };
    } else {
      this._messages = [{ role: "system", content: prompt.prompt, selected: true }];
    }
    console.log("calling updateResponse");
    let chat_response = this._updateChatMessages(0, 0)

    this._view?.webview.postMessage({ type: 'addResponse', value: chat_response });
    this._view?.webview.postMessage({ type: 'setPrompt', value: '' });
  }

  public async search(prompt?: string) {
    // Check if the API key and URL are set
    if (!this._authInfo || !this._settings?.apiUrl) {
      this._view?.webview.postMessage({
        type: 'addResponse',
        value: '[ERROR] "API key or API URL not set, please go to extension settings (read README.md for more info)"',
      });
      return;
    }
    
    let chat_response = '';
    let searchPrompt = "";
    if (prompt!=undefined) {
      searchPrompt = await this._generate_search_prompt(prompt);
    } 
    // Show loading indicator
    this._view?.webview.postMessage({ type: 'setPrompt', value: this._prompt });
    this._view?.webview.postMessage({ type: 'addResponse', value: '...' });

    if (searchPrompt != "") {
      this._messages?.push({ role: "user", content: searchPrompt, selected:true })
    }

    if (!this._openai) {
      throw new Error('OpenAI instance is not initialized.');
    }
    
    if (typeof this._settings.model !== 'string') {
      throw new Error('Model identifier is not valid or not defined.');
    }

    // Only if you can't change the Message interface
    const isValidRole = (role: any): role is 'user' | 'assistant' | 'system' => {
      return ['user', 'assistant', 'system'].includes(role);
    };
    
    // Validate and type narrow `this._messages` before sending
    if (!this._messages || !Array.isArray(this._messages) ||
      (!this._messages.every(msg => isValidRole(msg.role)))) {
      throw new Error('Messages have invalid roles.');
    }

    // MCP: Gather tools from selected MCP servers
    let functions: any[] = [];
    if (this._selectedMcpServers && this._selectedMcpServers.length > 0 && this._mcpClients) {
      for (const serverName of this._selectedMcpServers) {
        console.log("serverName:", serverName);
        const client = this._mcpClients[serverName];
        if (client && typeof client.listTools === "function") {
          try {
            // listTools may be async
            const tools = await client.listTools();
            console.log("tools:", tools);
            if (Array.isArray(tools)) {
              functions = functions.concat(tools);
            }
          } catch (err) {
            console.error(`Failed to list tools for MCP server '${serverName}':`, err);
          }
        }
      }
    }

    const promtNumberOfTokens = this._getMessagesNumberOfTokens();
    let full_message = "";
    try {
      console.log("Creating message sender...");
      
      let messagesToSend: Array<Message> = [];
      
      // Assuming this._messages is defined and is an array
      for (const message of this._messages) {
        // Check if 'selected' is true; undefined or false values will be considered false
        if (message.selected) {
          // Add the message as a new entry, omitting the 'selected' key
          const { selected, ...messageWithoutSelected } = message; // Destructure and omit 'selected'
          messagesToSend.push(messageWithoutSelected);
        }
      }

      // If we have MCP tools, add them to the request
      const completionParams: any = {
        model: this._settings.model,
        messages: messagesToSend,
        stream: true,
        ...this._settings.options,
      };
      if (functions.length > 0) {
        completionParams.functions = functions;
        completionParams.function_call = 'auto';
      }

      // OpenAI v4.x streaming: use .stream() for async iterator
      let stream: any;
      try {
        // Try .stream() method (OpenAI SDK >=4.28.0)
        const resp: any = await this._openai.chat.completions.create(completionParams);
        if (typeof resp.stream === "function") {
          stream = await resp.stream();
        } else if (typeof (resp as any)[Symbol.asyncIterator] === "function") {
          // Some SDK versions return the stream directly
          stream = resp;
        }
      } catch (err: any) {
        throw new Error("OpenAI streaming API did not return an async iterable stream. Check SDK version and usage. " + (err && (err as Error).message ? (err as Error).message : err));
      }

      if (!stream || typeof (stream as any)[Symbol.asyncIterator] !== "function") {
        throw new Error("OpenAI streaming API did not return an async iterable stream. Check SDK version and usage.");
      }

      console.log("Message sender created");
      
      let completionTokens = 0;
      full_message = "";
      let toolCallInfo = null;
      let toolCallArgs = "";
      let toolCallName = "";
      let toolCallDetected = false;
      for await (const chunk of stream) {
        // Detect function_call/tool_call in the stream
        if (chunk.choices[0]?.delta?.function_call) {
          toolCallDetected = true;
          const delta = chunk.choices[0].delta.function_call;
          if (delta.name) toolCallName = delta.name;
          if (delta.arguments) toolCallArgs += delta.arguments;
          // Show a message in the UI that a tool is being called
          this._view?.webview.postMessage({
            type: 'addResponse',
            value: `[TOOL CALL] Model is calling tool: ${toolCallName || '[unknown]'}`
          });
        }
        const content = chunk.choices[0]?.delta?.content || "";
        //console.log("chunk:",chunk);
        //console.log("content:", content);
        const tokenList = this._enc.encode(content);
        completionTokens += tokenList.length;
        //console.log("tokens:", completionTokens);
        full_message += content;
        this._view?.webview.postMessage({ type: 'addResponse', value: full_message });
      }

      // If a tool call was detected, actually call the tool and continue the conversation
      if (toolCallDetected && toolCallName) {
        let toolResult = "";
        try {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(toolCallArgs);
          } catch (e) {
            parsedArgs = {};
          }
          // Find the MCP client that has this tool
          let toolInvoked = false;
          for (const serverName of this._selectedMcpServers) {
            const client = this._mcpClients[serverName];
            if (client && typeof client.callFunction === "function") {
              try {
                toolResult = await client.callFunction({ name: toolCallName, arguments: parsedArgs });
                toolInvoked = true;
                break;
              } catch (err) {
                // Try next server
              }
            }
          }
          if (!toolInvoked) {
            toolResult = `[ERROR] Tool ${toolCallName} not found or failed to execute.`;
          }
        } catch (err) {
          toolResult = `[ERROR] Exception calling tool: ${err}`;
        }
        // Add the tool result as a function message
        this._messages?.push({ role: "function", name: toolCallName, content: toolResult, selected: true } as any);
        // Now, continue the conversation with the tool result
        let messagesToSend: Array<Message> = [];
        for (const message of this._messages) {
          if (message.selected) {
            const { selected, ...messageWithoutSelected } = message;
            messagesToSend.push(messageWithoutSelected);
          }
        }
        const completionParams2: any = {
          model: this._settings.model,
          messages: messagesToSend,
          stream: true,
          ...this._settings.options,
        };
        let stream2: any;
        try {
          const resp2: any = await this._openai.chat.completions.create(completionParams2);
          if (typeof resp2.stream === "function") {
            stream2 = await resp2.stream();
          } else if (typeof (resp2 as any)[Symbol.asyncIterator] === "function") {
            stream2 = resp2;
          }
        } catch (err: any) {
          throw new Error("OpenAI streaming API did not return an async iterable stream. Check SDK version and usage. " + (err && (err as Error).message ? (err as Error).message : err));
        }
        if (!stream2 || typeof (stream2 as any)[Symbol.asyncIterator] !== "function") {
          throw new Error("OpenAI streaming API did not return an async iterable stream. Check SDK version and usage.");
        }
        let completionTokens2 = 0;
        let full_message2 = "";
        for await (const chunk2 of stream2) {
          const content2 = chunk2.choices[0]?.delta?.content || "";
          const tokenList2 = this._enc.encode(content2);
          completionTokens2 += tokenList2.length;
          full_message2 += content2;
          this._view?.webview.postMessage({ type: 'addResponse', value: full_message2 });
        }
        this._messages?.push({ role: "assistant", content: full_message2, selected: true });
        chat_response = this._updateChatMessages(promtNumberOfTokens, completionTokens2);
      } else {
        this._messages?.push({ role: "assistant", content: full_message, selected:true })
        chat_response = this._updateChatMessages(promtNumberOfTokens, completionTokens);
      }
      console.log("Full message:", full_message);
      console.log("Full Number of tokens:", completionTokens);
      const tokenList = this._enc.encode(full_message);
      console.log("Full Number of tokens tiktoken:", tokenList.length);
    } catch (e: any) {
      console.error(e);
      if (this._response!=undefined) {
        this._messages?.push({ role: "assistant", content: full_message, selected:true })
        chat_response = this._response;
        chat_response += `\n\n---\n[ERROR] ${e}`;
      }
    }
    this._response = chat_response;
    this._view?.webview.postMessage({ type: 'addResponse', value: chat_response });
    this._view?.webview.postMessage({ type: 'setPrompt', value: '' });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
  
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
    const microlightUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'microlight.min.js'));
    const tailwindUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'tailwind.min.js'));
    const showdownUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'showdown.min.js'));
  
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="${tailwindUri}"></script>
      <script src="${showdownUri}"></script>
      <script src="${microlightUri}"></script>
      <link rel="stylesheet" href="${stylesUri}">
    </head>
    <body>
      <div id="container">
        <div id="top-wrapper">
          <label for="provider-selector">Provider:</label>
          <select id="provider-selector"></select>
          <label for="model-selector">Model:</label>
          <select id="model-selector"></select>
        </div>
        <div id="response" class="text-sm"></div>
        <div id="input-wrapper">
          <div>
            <label for="system-prompt-selector">System Prompt:</label>
            <select id="system-prompt-selector">
            </select>
          </div>
          <input type="text" id="prompt-input" placeholder="Ask ChatGPT something">
        </div>
      </div>
      <script src="${scriptUri}"></script>
    </body>
    </html>`;
  }

  public addImageToChat(imageDataUrl: string, fileName: string) {
    const imageMarkdown = `![${fileName}](${imageDataUrl})`;
    let newMessage: UserMessage = { 
      role: "user", 
      content: [
        {
          "type": "text",
          "text": fileName + ":"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": imageDataUrl
          }
        }
      ], 
      selected: true
    };

    
    this._messages?.push(newMessage);
  
    const chat_response = this._updateChatMessages(this._getMessagesNumberOfTokens(), 0);
    this._view?.webview.postMessage({ type: 'addResponse', value: chat_response });
  }
}
