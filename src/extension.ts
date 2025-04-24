import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Provider, Prompt, ProviderSettings, MCPServersConfig } from './types';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { ChatGPTViewProvider } from './chatGptViewProvider';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Base URL for OpenAI API
const BASE_URL = 'https://api.openai.com/v1';

export function activate(context: vscode.ExtensionContext) {
	console.log('activating extension "chatgpt"');
	// Get the settings from the extension's configuration
	const config = vscode.workspace.getConfiguration('chatgpt');

	// Create a new ChatGPTViewProvider instance and register it with the extension's context
	const provider = new ChatGPTViewProvider(context.extensionUri);

	let providers: Provider[] = config.get('providers') || [];
	console.log("Providers:", providers);

	let prompts: Prompt[] = config.get('prompts') || [];
	console.log("prompts:", prompts);

	// MCP servers configuration
	const mcpServers: MCPServersConfig = config.get('mcpServers') || {};
	console.log("MCP Servers:", mcpServers);

	// MCP server process management
	const mcpServerProcesses: { [name: string]: ChildProcessWithoutNullStreams } = {};
	const mcpClients: { [name: string]: { client: Client, transport: StdioClientTransport } } = {};

	for (const [name, server] of Object.entries(mcpServers)) {
		try {
			const proc = spawn(server.command, server.args, {
				env: { ...process.env, ...(server.env || {}) },
				stdio: 'pipe'
			});
			mcpServerProcesses[name] = proc;
			console.log(`Started MCP server '${name}' (PID: ${proc.pid})`);
			proc.on('error', (err) => {
				console.error(`MCP server process error for '${name}':`, err);
			});
			proc.on('exit', (code, signal) => {
				console.error(`MCP server process for '${name}' exited with code ${code}, signal ${signal}`);
			});
			proc.stdout?.on('data', (data) => {
				console.log(`[MCP ${name} STDOUT]: ${data.toString()}`);
			});
			proc.stderr?.on('data', (data) => {
				console.error(`[MCP ${name} STDERR]: ${data.toString()}`);
			});

			const transport = new StdioClientTransport({
				command: server.command,
				args: server.args,
				env: server.env
			});
			const client = new Client({ name, version: '0.1.0', transport });
			mcpClients[name] = { client, transport };
			console.log(`MCP client created for server '${name}'`);
		} catch (err) {
			console.error(`Failed to start MCP server '${name}':`, err);
		}
	}
	// Pass MCP clients to the provider
	provider.setMcpClients(mcpClients);

	let activate_provider_settings: ProviderSettings = {
	  model: "none",
	  apiUrl: BASE_URL,
	  apiKey: "none",
	  options: {
		maxModelTokens: 1000,
		maxResponseTokens: 1000,
		temperature: 1.0,
	  },
	};

	if (providers && providers.length > 0) {
		const firstProvider = providers[0];
		if (firstProvider.models && firstProvider.models.length > 0) {
			const firstModel = firstProvider.models[0];
			// Assuming firstModel and firstProvider are already defined based on your JSON structure:
			activate_provider_settings = {
			  model: firstModel.name,
			  apiUrl: firstProvider.apiUrl,
			  apiKey: firstProvider.apiKey,
			  options: {
				...firstModel.options, // Spread operator to include all keys from options
			  },
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
	  options: {
		...activate_provider_settings.options, // Use spread operator to include all options
	  },
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
		vscode.commands.registerCommand('chatgpt.useSelectionAsChat', () => provider.useSelectionAsChat()),

		// MCP server selector command
		vscode.commands.registerCommand('chatgpt.selectMcpServers', async () => {
			const mcpServerNames = Object.keys(mcpServers);
			if (mcpServerNames.length === 0) {
				vscode.window.showInformationMessage('No MCP servers are configured.');
				return;
			}
			const selected = await vscode.window.showQuickPick(
				mcpServerNames.map(name => ({
					label: name,
					picked: true
				})),
				{
					canPickMany: true,
					title: 'Select MCP Servers for this session'
				}
			);
			if (selected) {
				const selectedNames = selected.map(item => item.label);
				// Store the selection in a plain JS object, not the frozen context
				(globalThis as any).__chatgpt_selectedMcpServers = selectedNames;
				provider.setSelectedMcpServers(selectedNames);
				vscode.window.showInformationMessage(
					`Selected MCP servers: ${selectedNames.join(', ')}`
				);
			}
		})
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
					  apiKey: firstProvider.apiKey,
					  options: {
						...firstModel.options, // Use spread operator to include all options
					  },
					};
				}
				provider.setSettings({
				  apiUrl: activate_provider_settings.apiUrl,
				  model: activate_provider_settings.model,
				  options: {
					...activate_provider_settings.options, // Use spread operator to include all options
				  },
				});
			
				// Put configuration settings into the provider
				provider.setAuthenticationInfo({
					apiKey: activate_provider_settings.apiKey,
					apiUrl: activate_provider_settings.apiUrl
				});
				
				provider.set_providers(providers);//Update the selectors
			}
		} else if (event.affectsConfiguration('chatgpt.prompts')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			let prompts: Prompt[] = config.get('prompts') || [];

			if (prompts && prompts.length > 0) {
				const firstPrompt = prompts[0];
				provider.set_prompt(firstPrompt);
			}
			provider.set_prompts(prompts);
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

// This method is called when your extension is deactivated
export function deactivate() { }
