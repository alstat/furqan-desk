import { activeClass } from '$lib/data/config';

// highlighter
export function modifyText(command: string, showUI: boolean = false, value: string | null = null) {
	if (value === 'N') {
		value = 'H6';
	}
	return document.execCommand(command, showUI, value ?? undefined);
}

export function link(command: string) {
	let userLink: string;

	if (command === 'unlink') {
		userLink = '';
	} else {
		userLink = prompt('Enter a URL')!;
	}

	if (/http/i.test(userLink)) {
		modifyText(command, false, userLink);
	} else {
		userLink = 'http://' + userLink;
		modifyText(command, false, userLink);
	}
}

export function highlighter(className: NodeListOf<HTMLButtonElement>, needsRemoval: boolean) {
	className.forEach((button: HTMLButtonElement) => {
		button.addEventListener('mousedown', (event) => {
			event.preventDefault();
			//needsRemoval = true means only one button should be highlight and other would be normal
			if (needsRemoval) {
				let alreadyActive = false;
				//If currently clicked button is already active
				if (button.classList.contains(activeClass)) {
					alreadyActive = true;
				}
				//Remove highlight from other buttons
				highlighterRemover(className);
				if (!alreadyActive) {
					//highlight clicked button
					button.classList.add(activeClass);
				}
			} else {
				//if other buttons can be highlighted
				button.classList.toggle(activeClass);
			}
		});
	});
}

export function highlighterRemover(className: NodeListOf<HTMLButtonElement>) {
	className.forEach((button: HTMLButtonElement) => {
		button.classList.remove(activeClass);
	});
}
