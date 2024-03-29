// @ts-ignore 

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    let response = '';

    // Handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.type) {
            case "addResponse": {
                response = message.value;
                setResponse();
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
        }
    });

    function fixCodeBlocks(response) {
        // Use a regular expression to find all occurrences of the substring in the string
        const REGEX_CODEBLOCK = new RegExp('\`\`\`', 'g');
        const matches = response.match(REGEX_CODEBLOCK);

        // Return the number of occurrences of the substring in the response, check if even
        const count = matches ? matches.length : 0;
        if (count % 2 === 0) {
            return response;
        } else {
            // else append ``` to the end to make the last code block complete
            return response.concat('\n\`\`\`');
        }

    }

    function setResponse() {
        var converter = new showdown.Converter({
            omitExtraWLInCodeBlocks: true,
            simplifiedAutoLink: true,
            excludeTrailingPunctuationFromURLs: true,
            literalMidWordUnderscores: true,
            simpleLineBreaks: true
        });
        response = fixCodeBlocks(response);
        html = converter.makeHtml(response);
        let responseDiv = document.getElementById("response");
        responseDiv.innerHTML = html;
        //responseDiv.scrollTop = responseDiv.scrollHeight;
        //responseDiv.scrollIntoView({ block: "end" });

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
        for (var i = 0; i < codeBlocks.length; i++) {
            // Check if innertext starts with "Copy code"
            if (codeBlocks[i].innerText.startsWith("Copy code")) {
                codeBlocks[i].innerText = codeBlocks[i].innerText.replace("Copy code", "");
            }

            codeBlocks[i].classList.add("inline-flex", "max-w-full", "overflow-hidden", "rounded-sm", "cursor-pointer");

            codeBlocks[i].addEventListener('click', function (e) {
                e.preventDefault();
                vscode.postMessage({
                    type: 'codeSelected',
                    value: this.innerText
                });
            });

            const d = document.createElement('div');
            d.innerHTML = codeBlocks[i].innerHTML;
            codeBlocks[i].innerHTML = null;
            codeBlocks[i].appendChild(d);
            d.classList.add("code");
        }

        microlight.reset('code');
        //responseDiv.scrollIntoView({ block: "end" });
        responseDiv.scrollTop = responseDiv.scrollHeight;
        //document.getElementById("response").innerHTML = document.getElementById("response").innerHTML.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    }

    // Listen for keyup events on the prompt input element
    document.getElementById('prompt-input').addEventListener('keyup', function (e) {
        // If the Enter key was pressed without the Ctrl key
        if (e.key === "Enter" && !e.ctrlKey) {
            vscode.postMessage({
                type: 'prompt',
                value: this.value
            });
        }
        // If the Enter key was pressed with the Ctrl key
        else if (e.key === "Enter" && e.ctrlKey) {
            vscode.postMessage({
                type: 'promptNoQuery',
                value: this.value
            });
        }
    });


    window.myFunction = function(checkboxElem) {
        if (checkboxElem.checked) {
            console.log(checkboxElem.id + " is checked");
            // Add your postMessage or other logic here
            vscode.postMessage({
                type: 'checkboxChanged',
                id: checkboxElem.id,
                checked: true
            });
        } else {
            console.log(checkboxElem.id + " is unchecked");
            // Add your postMessage or other logic here
            vscode.postMessage({
                type: 'checkboxChanged',
                id: checkboxElem.id,
                checked: false
            });
        }
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
