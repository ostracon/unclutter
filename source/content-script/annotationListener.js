import {
	highlightAnnotations,
	removeAllHighlights,
	getHighlightOffsets,
	removeHighlight,
} from './annotationApi';
import throttle from 'lodash/throttle';

let listenerRef;
export function createAnnotationListener(sidebarIframe) {
	// highlight new sent annotations, and send back display offsets
	const onMessage = async function ({ data }) {
		if (!sidebarIframe.contentWindow) {
			window.removeEventListener('message', this);
			return;
		}

		if (data.event == 'anchorAnnotations') {
			console.info(
				`anchoring ${data.annotations.length} annotations on page...`
			);
			const pageNotes = data.annotations.filter(
				(a) => !a.quote_html_selector
			);
			const anchoredAnnotations = await highlightAnnotations(
				data.annotations
			);
			sidebarIframe.contentWindow.postMessage(
				{
					event: 'anchoredAnnotations',
					annotations: anchoredAnnotations.concat(pageNotes),
				},
				'*'
			);
		} else if (data.event === 'removeHighlight') {
			removeHighlight(data.annotation);
		}
	};
	window.addEventListener('message', onMessage);
	listenerRef = onMessage;

	// update offsets if the page changes (e.g. after insert of mobile css)
	_observeHeightChange(document, () => {
		if (!sidebarIframe.contentWindow) {
			resizeObserver?.unobserve(document.body);
			return;
		}

		console.info(`page resized, recalculating annotation offsets...`);
		const offsetById = getHighlightOffsets();
		sidebarIframe.contentWindow.postMessage(
			{
				event: 'changedDisplayOffset',
				offsetById,
			},
			'*'
		);
	});
}

export function removeAnnotationListener() {
	window.removeEventListener('message', listenerRef);
	resizeObserver?.unobserve(document.body);
	removeAllHighlights();
}

let resizeObserver;
function _observeHeightChange(document, callback) {
	const throttledCallback = throttle(callback, 2000);

	let oldHeight = document.body.scrollHeight;
	resizeObserver = new ResizeObserver((entries) => {
		const newHeight = entries[0].target.scrollHeight;

		if (newHeight !== oldHeight) {
			throttledCallback(document.body.scrollHeight + 'px');
			oldHeight = newHeight;
		}
	});

	resizeObserver.observe(document.body);
}
