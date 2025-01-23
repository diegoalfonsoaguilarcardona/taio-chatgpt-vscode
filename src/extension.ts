import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml'; 
import OpenAI from "openai";
import { encodingForModel } from "js-tiktoken";
import { ChatCompletionAssistantMessageParam, ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionContentPartText, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from 'openai/resources/chat/completions';


type AuthInfo = { apiKey?: string, apiUrl?: string };
type Settings = {
	selectedInsideCodeblock?: boolean,
	codeblockWithLanguageId?: false,
	pasteOnClick?: boolean,
	keepConversation?: boolean,
	timeoutLength?: number,
	model?: string,
	maxModelTokens?: number,
	maxResponseTokens?: number,
	apiUrl?: string
};


const BASE_URL = 'https://api.openai.com/v1';

interface Model {
	name: string;
	maxModelTokens: number;
	maxResponseTokens: number;
	temperature: number;
}

interface Provider {
	name: string;
	apiKey: string;
	apiUrl: string;
	models: Model[];
}

interface ProviderSettings {
	model: string;
	apiUrl: string;
	maxModelTokens: number;
	maxResponseTokens: number;
	temperature: number;
	apiKey: string;
}


export function activate(context: vscode.ExtensionContext) {

	console.log('activating extension "chatgpt"');
	// Get the settings from the extension's configuration
	const config = vscode.workspace.getConfiguration('chatgpt');

	// Create a new ChatGPTViewProvider instance and register it with the extension's context
	const provider = new ChatGPTViewProvider(context.extensionUri);

	let providers: Provider[] = config.get('providers') || [];
	console.log("Providers:", providers);

	let activate_provider_settings: ProviderSettings = {
		model: "none",
		apiUrl: BASE_URL,
		maxModelTokens: 1000,
		maxResponseTokens: 1000,
		temperature: 1.0,
		apiKey: "none"
	};

	if (providers && providers.length > 0) {
		const firstProvider = providers[0];
		if (firstProvider.models && firstProvider.models.length > 0) {
			const firstModel = firstProvider.models[0];
			activate_provider_settings = {
				model: firstModel.name,
				apiUrl: firstProvider.apiUrl,
				maxModelTokens: firstModel.maxModelTokens,
				maxResponseTokens: firstModel.maxResponseTokens,
				temperature: firstModel.temperature,
				apiKey: firstProvider.apiKey
			};
		}
	}
	
	provider.setSettings({
		selectedInsideCodeblock: config.get('selectedInsideCodeblock') || false,
		codeblockWithLanguageId: config.get('codeblockWithLanguageId') || false,
		pasteOnClick: config.get('pasteOnClick') || false,
		keepConversation: config.get('keepConversation') || false,
		timeoutLength: config.get('timeoutLength') || 60,
		apiUrl: activate_provider_settings.apiUrl,
		model: activate_provider_settings.model,
		maxModelTokens: activate_provider_settings.maxModelTokens,
		maxResponseTokens: activate_provider_settings.maxResponseTokens
	});

	// Put configuration settings into the provider
	provider.setAuthenticationInfo({
		apiKey: activate_provider_settings.apiKey,
		apiUrl: activate_provider_settings.apiUrl
	});
	
	// Register the provider with the extension's context
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatGPTViewProvider.viewType, provider, {
			webviewOptions: { retainContextWhenHidden: true }
		})
	
	);

	const commandHandler = (command: string) => {
		const config = vscode.workspace.getConfiguration('chatgpt');
		const prompt = config.get(command) as string;
		provider.search(prompt);
	};

	// Register the commands that can be called from the extension's package.json
	context.subscriptions.push(
		vscode.commands.registerCommand('chatgpt.ask', () =>
			vscode.window.showInputBox({ prompt: 'What do you want to do?' })
				.then((value) => provider.search(value))
		),
		vscode.commands.registerCommand('chatgpt.explain', () => commandHandler('promptPrefix.explain')),
		vscode.commands.registerCommand('chatgpt.refactor', () => commandHandler('promptPrefix.refactor')),
		vscode.commands.registerCommand('chatgpt.optimize', () => commandHandler('promptPrefix.optimize')),
		vscode.commands.registerCommand('chatgpt.findProblems', () => commandHandler('promptPrefix.findProblems')),
		vscode.commands.registerCommand('chatgpt.documentation', () => commandHandler('promptPrefix.documentation')),
		vscode.commands.registerCommand('chatgpt.resetConversation', () => provider.resetConversation()),
		vscode.commands.registerCommand('chatgpt.pasteChat', () => provider.pasteChat()),
		vscode.commands.registerCommand('chatgpt.useSelectionAsChat', () => provider.useSelectionAsChat())

		
	);


	// Change the extension's session token or settings when configuration is changed
	vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
		if (event.affectsConfiguration('chatgpt.providers')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			let providers: Provider[] = config.get('providers') || [];

			if (providers && providers.length > 0) {
				const firstProvider = providers[0];
				if (firstProvider.models && firstProvider.models.length > 0) {
					const firstModel = firstProvider.models[0];
					activate_provider_settings = {
						model: firstModel.name,
						apiUrl: firstProvider.apiUrl,
						maxModelTokens: firstModel.maxModelTokens,
						maxResponseTokens: firstModel.maxResponseTokens,
						temperature: firstModel.temperature,
						apiKey: firstProvider.apiKey
					};
				}
				provider.setSettings({
					apiUrl: activate_provider_settings.apiUrl,
					model: activate_provider_settings.model,
					maxModelTokens: activate_provider_settings.maxModelTokens,
					maxResponseTokens: activate_provider_settings.maxResponseTokens
				});
			
				// Put configuration settings into the provider
				provider.setAuthenticationInfo({
					apiKey: activate_provider_settings.apiKey,
					apiUrl: activate_provider_settings.apiUrl
				});
				
				provider.set_providers(providers);//Update the selectors
			}
		} else if (event.affectsConfiguration('chatgpt.selectedInsideCodeblock')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ selectedInsideCodeblock: config.get('selectedInsideCodeblock') || false });
		} else if (event.affectsConfiguration('chatgpt.codeblockWithLanguageId')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ codeblockWithLanguageId: config.get('codeblockWithLanguageId') || false });
		} else if (event.affectsConfiguration('chatgpt.pasteOnClick')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ pasteOnClick: config.get('pasteOnClick') || false });
		} else if (event.affectsConfiguration('chatgpt.keepConversation')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ keepConversation: config.get('keepConversation') || false });
		} else if (event.affectsConfiguration('chatgpt.timeoutLength')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ timeoutLength: config.get('timeoutLength') || 60 });
		}
	});


	context.subscriptions.push(
		vscode.commands.registerCommand('chatgpt.addImageToChat', async (uri: vscode.Uri) => {
		  if (uri && uri.fsPath) {
			const filePath = uri.fsPath;
			const fileName = path.basename(filePath);
			const fileData = await fs.promises.readFile(filePath, { encoding: 'base64' });
			const fileType = path.extname(filePath).substring(1); // get file extension without dot
			const imageDataUrl = `data:image/${fileType};base64,${fileData}`;
	
			// Post a message to the webview to add the image
			provider.addImageToChat(imageDataUrl, fileName);
		  }
		})
	  );
}

interface SystemMessage extends ChatCompletionSystemMessageParam {
	selected: boolean;  // Additional property specific to Message
}

interface UserMessage extends ChatCompletionUserMessageParam {
  selected: boolean;  // Additional property specific to Message
}

interface AssistantMessage extends ChatCompletionAssistantMessageParam {
	selected: boolean;  // Additional property specific to Message
}

type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage


class ChatGPTViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'chatgpt.chatView';
	private _view?: vscode.WebviewView;

	//private _chatGPTAPI?: ChatGPTAPI;
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
		maxModelTokens: 4000,
		maxResponseTokens: 1000
	};
	private _authInfo?: AuthInfo;

	// In the constructor, we store the URI of the extension
	constructor(private readonly _extensionUri: vscode.Uri) {
		this._messages = [];
		this._messages?.push({ role: "system", content: "You are a helpful assistant.", selected:true });
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
		if (settings.apiUrl || settings.model || settings.maxModelTokens || settings.maxResponseTokens) {
			changeModel = true;
		}
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
						this.set_providers(providers);
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
									maxModelTokens: model_data.maxModelTokens,
									maxResponseTokens: model_data.maxResponseTokens,
									temperature: model_data.temperature,
									apiKey: provider_data.apiKey
								};
								this.setSettings({
									apiUrl: provider_settings.apiUrl,
									model: provider_settings.model,
									maxModelTokens: provider_settings.maxModelTokens,
									maxResponseTokens: provider_settings.maxResponseTokens
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
			}
		});
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
		this._messages?.push({ role: "system", content: "You are a helpful assistant.", selected:true });
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
			chat_response += `\n\n---\n*<sub>Total Tokens: ${this._totalNumberOfTokens},  Tokens used: ${promtNumberOfTokens + completionTokens} (${promtNumberOfTokens}+${completionTokens}), model: ${this._settings.model}, maxModelTokens: ${this._settings.maxModelTokens}, maxResponseTokens: ${this._settings.maxResponseTokens}</sub>* \n\n---\n\n\n\n\n\n\n`;
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

		const promtNumberOfTokens = this._getMessagesNumberOfTokens();
		try {
			console.log("Creating message sender...");
			let messagesToSend: Array<Message> = [];
			
			// Assuming this._messages is defined and is an array
			for (const message of this._messages) {
				if (message.selected === true) {
					if (messagesToSend.length > 0 && messagesToSend[messagesToSend.length - 1].role === message.role) {
						// Append the content to the previous message if the role is the same
						messagesToSend[messagesToSend.length - 1] = {
							...messagesToSend[messagesToSend.length - 1],
							content: messagesToSend[messagesToSend.length - 1].content + '\n' + message.content,
						};
					} else {
						// Add the message as a new entry if the role is different
						messagesToSend.push({ ...message });
					}
				}
			}			
			const stream = await this._openai.chat.completions.create({
				model: this._settings.model,
				messages: messagesToSend,
				stream: true,
				max_tokens: this._settings.maxResponseTokens,
			});
			console.log("Message sender created");
			
			let completionTokens = 0;
			let full_message = "";
			for await (const chunk of stream) {
				const content = chunk.choices[0]?.delta?.content || "";
				console.log("chunk:",chunk);
				console.log("content:", content);
				const tokenList = this._enc.encode(content);
				completionTokens += tokenList.length;
				console.log("tokens:", completionTokens);
				full_message += content;
				//this._response = chat_response;
				this._view?.webview.postMessage({ type: 'addResponse', value: full_message });

			}
			this._messages?.push({ role: "assistant", content: full_message, selected:true })
			console.log("Full message:", full_message);
			console.log("Full Number of tokens:", completionTokens);
			const tokenList = this._enc.encode(full_message);
			console.log("Full Number of tokens tiktoken:", tokenList.length);
			chat_response = this._updateChatMessages(promtNumberOfTokens, tokenList.length)
		} catch (e: any) {
			console.error(e);
			if (this._response!=undefined) {
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
                    <button id="add-model">+Add</button>
                </div>
                <div id="response" class="text-sm"></div>
                <div id="input-wrapper">
                    <div>
                        <label for="temperature-slider">Temperature:</label>
                        <input type="range" id="temperature-slider" min="0" max="100" value="${0.5 * 100}" />
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


// This method is called when your extension is deactivated
export function deactivate() { }