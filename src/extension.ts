import * as vscode from 'vscode';
import fetch from 'node-fetch'; // add this line
import { MessageChannel } from 'worker_threads';


type AuthInfo = { apiKey?: string };
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

export function activate(context: vscode.ExtensionContext) {

	console.log('activating extension "chatgpt"');
	// Get the settings from the extension's configuration
	const config = vscode.workspace.getConfiguration('chatgpt');

	// Create a new ChatGPTViewProvider instance and register it with the extension's context
	const provider = new ChatGPTViewProvider(context.extensionUri);

	// Put configuration settings into the provider
	provider.setAuthenticationInfo({
		apiKey: config.get('apiKey')
	});
	
	provider.setSettings({
		selectedInsideCodeblock: config.get('selectedInsideCodeblock') || false,
		codeblockWithLanguageId: config.get('codeblockWithLanguageId') || false,
		pasteOnClick: config.get('pasteOnClick') || false,
		keepConversation: config.get('keepConversation') || false,
		timeoutLength: config.get('timeoutLength') || 60,
		apiUrl: config.get('apiUrl') || BASE_URL,
		model: config.get('model') || 'gpt-3.5-turbo',
		maxModelTokens: config.get('maxModelTokens') || 4000,
		maxResponseTokens: config.get('maxResponseTokens') || 1000
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
		vscode.commands.registerCommand('chatgpt.resetConversation', () => provider.resetConversation())
	);


	// Change the extension's session token or settings when configuration is changed
	vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
		if (event.affectsConfiguration('chatgpt.apiKey')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setAuthenticationInfo({ apiKey: config.get('apiKey') });
		} else if (event.affectsConfiguration('chatgpt.apiUrl')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			let url = config.get('apiUrl') as string || BASE_URL;
			provider.setSettings({ apiUrl: url });
		} else if (event.affectsConfiguration('chatgpt.model')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ model: config.get('model') || 'gpt-3.5-turbo' });
		} else if (event.affectsConfiguration('chatgpt.maxModelTokens')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ maxModelTokens: config.get('maxModelTokens') || 4000 });
		} else if (event.affectsConfiguration('chatgpt.maxResponseTokens')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ maxResponseTokens: config.get('maxResponseTokens') || 4000 });
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
}




interface Message {
	role: string;
	content: string;
}

interface ChatGPTResponse {
  choices: Array<{
	finish_reason: string;
	index: number;

	message: {
	  content: string;
	  role: string;
	};
  }>;
  created: number;
  id: string;
  model: string;
  object: string;
  usage: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  }
}

class ChatGPTViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'chatgpt.chatView';
	private _view?: vscode.WebviewView;

	//private _chatGPTAPI?: ChatGPTAPI;
	private _conversation?: any;
	private _messages?: Message[];

	private _response?: string;
	private _totalNumberOfTokens?: number;
	private _prompt?: string;
	private _fullPrompt?: string;
	private _currentMessageNumber = 0;

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
		this._messages?.push({ role: "system", content: "You are a helpful assistant." });
		console.log("constructor....");
		console.log("messages:", this._messages);
	}

	// Set the API key and create a new API instance based on this key
	public setAuthenticationInfo(authInfo: AuthInfo) {
		this._authInfo = authInfo;
		//this._newAPI();
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
	//private _newAPI() {
	//	console.log("New API");
	//	if (!this._authInfo || !this._settings?.apiUrl) {
	//		console.warn("API key or API URL not set, please go to extension settings (read README.md for more info)");
	//	} else {
	//		this._chatGPTAPI = new ChatGPTAPI({
	//			apiKey: this._authInfo.apiKey || "xx",
	//			apiBaseUrl: this._settings.apiUrl,
	//			completionParams: { model: this._settings.model || "gpt-3.5-turbo" },
	//			maxModelTokens: this._settings.maxModelTokens,
	//			maxResponseTokens: this._settings.maxResponseTokens
	//		});
	//		// console.log( this._chatGPTAPI );
	//	}
	//}

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
		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
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
				case 'prompt':
					{
						this.search(data.value);
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
		this._view?.webview.postMessage({ type: 'addResponse', value: '' });
		this._messages = [];
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


	public async search(prompt?: string) {
		this._prompt = prompt;
		if (!prompt) {
			prompt = '';
		}

		// Check if the API key and URL are set
		if (!this._authInfo || !this._settings?.apiUrl) {
			this._view?.webview.postMessage({
				type: 'addResponse',
				value: '[ERROR] "API key or API URL not set, please go to extension settings (read README.md for more info)"',
			});
			return;
		}

		// Focus the ChatGPT view
		if (!this._view) {
			await vscode.commands.executeCommand('chatgpt.chatView.focus');
		} else {
			this._view?.show?.(true);
		}

		// Initialize response and token count
		let chat_response = '';
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
		const currentMessageNumber = this._currentMessageNumber;

		// Show loading indicator
		this._view?.webview.postMessage({ type: 'setPrompt', value: this._prompt });
		this._view?.webview.postMessage({ type: 'addResponse', value: '...' });

		try {
			// Make POST request to OpenAI Chat API
			const url = `${this._settings.apiUrl}/chat/completions`;
			this._messages?.push({ role: "user", content: searchPrompt })
			const body = JSON.stringify({
				model: this._settings.model,
				messages: this._messages,
			});

			console.log("url:", url);
			console.log("body:", body);
			console.log("key:", this._authInfo.apiKey);
			console.log("messages:", this._messages);
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this._authInfo.apiKey}`,
				},
				body,
			});

			// Check for errors
			if (!response.ok) {
				throw new Error(`OpenAI API request failed with status: ${response.status}`);
			}

			const data = await response.json() as ChatGPTResponse;

			// Update response and token count
			//chat_response = this._response;
			//chat_response += "\nYou:\n" + this._fullPrompt + "\n";
			//chat_response += "\nChatGPT:\n" + data.choices[0].message.content;
			
			this._messages?.push({ role: data.choices[0].message.role, content: data.choices[0].message.content })
			
			if (this._messages) {
				for (const message of this._messages) {
					chat_response += "\n# <u>" + message.role.toUpperCase() + "</u>:\n" + message.content;
				}
			}


			if (data.usage?.total_tokens) {
				this._totalNumberOfTokens += data.usage.total_tokens;
				chat_response += `\n\n---\n*<sub>Total Tokens: ${this._totalNumberOfTokens},  Tokens used: ${data.usage.total_tokens} (${data.usage.prompt_tokens}+${data.usage.completion_tokens}), model: ${this._settings.model}, maxModelTokens: ${this._settings.maxModelTokens}, maxResponseTokens: ${this._settings.maxResponseTokens}</sub>* \n\n---\n`;
			}

			// Update conversation context if enabled
			if (this._settings.keepConversation) {
				this._conversation = {
					parentMessageId: data.id,
				};
			}
		} catch (e: any) {
			console.error(e);
			if (this._currentMessageNumber === currentMessageNumber) {
				chat_response = this._response;
				chat_response += `\n\n---\n[ERROR] ${e}`;
			}
		}

		// Update the response in the view
		if (this._currentMessageNumber === currentMessageNumber && this._view) {
			this._response = chat_response;
			this._view.webview.postMessage({ type: 'addResponse', value: chat_response });
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {

		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const microlightUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'microlight.min.js'));
		const tailwindUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'showdown.min.js'));
		const showdownUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'tailwind.min.js'));

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<script src="${tailwindUri}"></script>
				<script src="${showdownUri}"></script>
				<script src="${microlightUri}"></script>
				<style>
				.code {
					white-space: pre;
				}
				p {
					padding-top: 0.3rem;
					padding-bottom: 0.3rem;
				}
				/* overrides vscodes style reset, displays as if inside web browser */
				ul, ol {
					list-style: initial !important;
					margin-left: 10px !important;
				}
				h1, h2, h3, h4, h5, h6 {
					font-weight: bold !important;
				}
				</style>
			</head>
			<body>
				<div id="response" class="pt-4 text-sm">
				</div>
				<input class="h-10 w-full text-white bg-stone-700 p-4 text-sm" placeholder="Ask ChatGPT something" id="prompt-input" />
				<script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }