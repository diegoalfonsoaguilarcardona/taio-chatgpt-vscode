// @ts-ignore

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    let response = '';
    let providers = []; // To store providers
    let prompts = []; 
    let models = []; // To store models for the selected provider
    let selectedProviderIndex = 0;

    // Function to populate the provider and model selectors
    function populateSelectors(providers, selectedProviderIndex = 0, selectedModelIndex = 0) {
        const providerSelector = document.getElementById('provider-selector');
        providerSelector.innerHTML = ''; // Clear existing options
        providers.forEach((provider, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = provider.name;
            providerSelector.appendChild(option);
        });

        if (providers.length > 0) {
            providerSelector.value = selectedProviderIndex; // Set default selection
            models = providers[selectedProviderIndex].models;
        }

        const modelSelector = document.getElementById('model-selector');
        modelSelector.innerHTML = ''; // Clear existing options
        models.forEach((model, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = model.name;
            modelSelector.appendChild(option);
        });

        if (models.length > 0) {
            modelSelector.value = selectedModelIndex; // Set default selection
        }
    }

    function populatePrompts(prompts, selectedPromptIndex = 0) {
        const promptSelector = document.getElementById('system-prompt-selector');
        promptSelector.innerHTML = ''; // Clear existing options
        prompts.forEach((prompt, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = prompt.name;
            promptSelector.appendChild(option);
        });

        if (prompts.length > 0) {
            promptSelector.value = selectedPromptIndex; // Set default selection
            //models = providers[selectedProviderIndex].models;
        }
    }

    window.addEventListener('load', () => {
        // Notify the extension that the webview is ready
        vscode.postMessage({ type: 'ready' });
    });
    
    // Note: Ensure you import the vscode API object correctly in your web script.
    
    // Handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.type) {
            case "addResponse": {
                response = message.value;
                setResponse();
                break;
            }
            case "updateResponse": {
                console.log("Update Response!!!!!");
                setResponse();
                console.log("After Update Response !!!!!!!!!");
                break;                
            }
            case "clearResponse": {
                response = '';
                break;
            }
            case "setPrompt": {
                document.getElementById("prompt-input").value = message.value;
                break;
            }
            case "initialize": { 
                providers = message.value;
                populateSelectors(providers);
                break;
            }

            case "initialize_prompts": {
                console.log("Initialize Prompts:", message.value); 
                prompts = message.value;
                populatePrompts(prompts);
                break;
            }
        }
    });

    showdown.extension('thinkExtension', function() {
        return [
          {
            type: 'lang', // Process block-level syntax
            regex: /<think>([\s\S]*?)<\/think>/g,
            replace: function(match, content) {
              // Trim and process lines, ensuring let's handle `<p>` tags ourselves
              const pTags = content.trim().split('\n').map(line => {
                if (line.trim()) {
                  return `<p>${line.trim()}</p>`;
                }
                return '';
              }).join('');
      
              return `<think>${pTags}</think>`;
            }
          },
          {
            type: 'output', // After markdown is converted to HTML
            filter: function(text) {
              // Remove wrapping <p> tags around <think> elements
              return text.replace(/<p><think>/g, '<think>').replace(/<\/think><\/p>/g, '</think>');
            }
          }
        ];
    });

    function fixCodeBlocks(response) {
        const REGEX_CODEBLOCK = new RegExp('```', 'g');
        const matches = response.match(REGEX_CODEBLOCK);

        const count = matches ? matches.length : 0;
        return count % 2 === 0 ? response : response.concat('\n```');
    }

    function replaceInlineFileCodeWithLinks(container) {
        // Regex: most simple file paths like 'foo.ext', 'dir/file.ext', etc.
        const filePattern = /^[\w\-./]+\.[a-zA-Z0-9]+$/;
        // Only affect <code> that is NOT inside a <pre> (pre/code = code block, just code = inline code)
        container.querySelectorAll('code').forEach(codeElem => {
            if (codeElem.closest('pre')) return; // skip code blocks
            const text = codeElem.textContent.trim();
            if (filePattern.test(text)) {
                const a = document.createElement('a');
                a.textContent = text;
                a.href = "#";
                a.className = "file-link";
                a.tabIndex = 0;
                a.dataset.filepath = text;
                a.addEventListener('click', function(e) {
                    e.preventDefault();
                    window.lastClickedFileLink = this;
                    window.lastClickedScrollTop = this.closest("#response").scrollTop;
                    vscode.postMessage({
                        type: 'fileClicked',
                        value: text
                    });
                });
                codeElem.replaceWith(a);
            }
        });
    }
    
    function setResponse() {
        var converter = new showdown.Converter({
            omitExtraWLInCodeBlocks: true,
            simplifiedAutoLink: true,
            excludeTrailingPunctuationFromURLs: true,
            literalMidWordUnderscores: true,
            simpleLineBreaks: true,
            extensions: ['thinkExtension']
        });

        
        console.log("!!!!!!!!!!!!!!!!!!!!!Response!!!!!!!!!!!!");
        console.log(response)
        console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        response = fixCodeBlocks(response);
        console.log("!!!!!!!!!!!!!!!!!!!!!FixCodeBlockResponse!!!!!!!!!!!!");
        console.log(response)
        console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        const html = converter.makeHtml(response);
        console.log("!!!!!!!!!!!!!!!!!!!!!HTML!!!!!!!!!!!!");
        console.log(html)
        console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        const responseDiv = document.getElementById("response");
        responseDiv.innerHTML = html;

        //makeFileLinksClickable(responseDiv);
        replaceInlineFileCodeWithLinks(responseDiv);

        console.log("ResponseDiv after makeFileLinksClicable:");
        console.log(responseDiv);
        console.log("###################################");

        var preCodeBlocks = document.querySelectorAll("pre code");
        for (var i = 0; i < preCodeBlocks.length; i++) {
            preCodeBlocks[i].classList.add(
                "p-2",
                "my-2",
                "block",
                "overflow-x-scroll"
            );
        }

        var codeBlocks = document.querySelectorAll('code');
        codeBlocks.forEach(codeBlock => {
            if (codeBlock.innerText.startsWith("Copy code")) {
                codeBlock.innerText = codeBlock.innerText.replace("Copy code", "");
            }

            codeBlock.classList.add("inline-flex", "max-w-full", "overflow-hidden", "rounded-sm", "cursor-pointer");

            codeBlock.addEventListener('click', function (e) {
                e.preventDefault();
                vscode.postMessage({
                    type: 'codeSelected',
                    value: this.innerText
                });
            });

            const d = document.createElement('div');
            d.innerHTML = codeBlock.innerHTML;
            codeBlock.innerHTML = null;
            codeBlock.appendChild(d);
            d.classList.add("code");
        });

        microlight.reset('code');

        if (window.lastClickedFileLink && typeof window.lastClickedScrollTop === "number") {
            responseDiv.scrollTop = window.lastClickedScrollTop;
            // Optionally restore focus:
            let selector = 'a.file-link[data-filepath="' + window.lastClickedFileLink.dataset.filepath + '"]';
            let newFileLink = responseDiv.querySelector(selector);
            if (newFileLink) newFileLink.focus();
            window.lastClickedFileLink = null;
            window.lastClickedScrollTop = null;
        } else {
            responseDiv.scrollTop = responseDiv.scrollHeight;
        }
    }

    document.getElementById('prompt-input').addEventListener('paste', async function (e) {
        const clipboardItems = e.clipboardData.items;
        for (const item of clipboardItems) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                const reader = new FileReader();
                reader.onload = function (event) {
                    const base64Data = event.target.result;
                    vscode.postMessage({
                        type: 'pasteImage',
                        value: base64Data
                    });
                };
                reader.readAsDataURL(file);
            }
        }
    });

    document.getElementById('prompt-input').addEventListener('keyup', function (e) {
        if (e.key === "Enter" && !e.ctrlKey) {
            vscode.postMessage({
                type: 'prompt',
                value: this.value
            });
        }
        else if (e.key === "Enter" && e.ctrlKey) {
            vscode.postMessage({
                type: 'promptNoQuery',
                value: this.value
            });
        }
    });

    document.getElementById('provider-selector').addEventListener('change', function () {
        selectedProviderIndex = parseInt(this.value, 10);
        models = providers[selectedProviderIndex].models;
        populateSelectors(providers, selectedProviderIndex, 0);
        vscode.postMessage({
            type: 'providerModelChanged',
            providerIndex: selectedProviderIndex,
            modelIndex: 0
        });
    });

    document.getElementById('model-selector').addEventListener('change', function () {
        const selectedModelIndex = parseInt(this.value, 10);
        vscode.postMessage({
            type: 'providerModelChanged',
            providerIndex: selectedProviderIndex,
            modelIndex: selectedModelIndex,
        });
    });

    document.getElementById('system-prompt-selector').addEventListener('change', function () {
        const systemPromptIndex = parseInt(this.value, 10);
        vscode.postMessage({
            type: 'systemPromptChanged',
            systemPromptIndex: systemPromptIndex
        });
    });

    //document.getElementById('temperature-slider').addEventListener('input', function () {
    //    const temperature = parseInt(this.value, 10) / 100;
    //    vscode.postMessage({
    //        type: 'temperatureChanged',
    //        temperature: temperature,
    //    });
    //});

    window.myFunction = function (checkboxElem) {
        vscode.postMessage({
            type: 'checkboxChanged',
            id: checkboxElem.id,
            checked: checkboxElem.checked
        });
    }

    window.makeEditable = function (element) {
        element.contentEditable = 'true';
        element.focus();
    }

    window.saveContent = function (element) {
        element.contentEditable = 'false';
        const updatedContent = element.innerText;
        vscode.postMessage({
            type: 'messageContentChanged',
            id: element.id,
            value: updatedContent,
        });
    }

})();