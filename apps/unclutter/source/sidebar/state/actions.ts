import { useCallback, useEffect } from "react";
import { LindyAnnotation } from "../../common/annotations/create";
import { reportEventContentScript } from "@unclutter/library-components/dist/common/messaging";
import { deleteAnnotation, getAnnotations } from "../common/CRUD";
import { hideAnnotationLocally } from "../common/legacy";
import { AnnotationMutation } from "./local";

export function useFetchAnnotations(
    articleId: string,
    personalAnnotationsEnabled: boolean,
    enableSocialAnnotations: boolean,
    mutateAnnotations: React.Dispatch<AnnotationMutation>
) {
    useEffect(() => {
        (async function () {
            let annotations = await getAnnotations(
                articleId,
                personalAnnotationsEnabled,
                enableSocialAnnotations
            );

            // send anchor event even for empty list in order to remove annotations later

            // TODO re-enable page notes
            // const pageNotes = annotations.filter((a) => !a.quote_html_selector);
            // if (pageNotes.length === 0) {
            //     pageNotes.push(createDraftAnnotation(article_id, null));
            // }
            // show page notes immediately, others once anchored
            // mutateAnnotations({ action: "set", annotations: pageNotes });

            // local state is set in handleWindowEventFactory() once anchored on page

            window.top.postMessage(
                {
                    event: "anchorAnnotations",
                    annotations,
                    removePrevious: true, // remove previous annotations e.g. after changing settings
                    groupAfterAnchoring: true, // filter number of social annotations
                    requestAIAnnotationsAfterAnchoring: true, // paint AI annotations after each settings change
                },
                "*"
            );
        })();
    }, [personalAnnotationsEnabled, enableSocialAnnotations]);
}

export function useAnnotationModifiers(
    userId: string,
    mutateAnnotations: React.Dispatch<AnnotationMutation>
) {
    const deleteHideAnnotation = useCallback(
        deleteHideAnnotationFactory(userId, mutateAnnotations),
        [userId]
    );
    const updateAnnotation = useCallback(
        (annotation: LindyAnnotation) => mutateAnnotations({ action: "update", annotation }),
        []
    );
    const onAnnotationHoverUpdate = useCallback(
        onAnnotationHoverUpdateFactory(mutateAnnotations),
        []
    );

    return {
        deleteHideAnnotation,
        onAnnotationHoverUpdate,
        updateAnnotation,
    };
}

function deleteHideAnnotationFactory(
    userId: string,
    mutateAnnotations: React.Dispatch<AnnotationMutation>
) {
    return function (annotation: LindyAnnotation, threadStart?: LindyAnnotation) {
        // delete from local state first

        // is root, so remove entire thread
        mutateAnnotations({ action: "remove", annotation: annotation });
        if (annotation.quote_text) {
            window.top.postMessage({ event: "removeHighlights", annotations: [annotation] }, "*");
        }

        // delete or hide remotely
        if (annotation.isMyAnnotation) {
            deleteAnnotation(userId, annotation);
        } else {
            hideAnnotationLocally(annotation);

            // TODO add to moderation queue
            // hideRemoteAnnotation(annotation);

            reportEventContentScript("hideSocialAnnotation", {
                id: annotation.id,
                platform: annotation.platform,
            });
        }
    };
}

function onAnnotationHoverUpdateFactory(mutateAnnotations: React.Dispatch<AnnotationMutation>) {
    return function onAnnotationHoverUpdate(
        annotation: LindyAnnotation,
        hoverActive: boolean = false
    ) {
        if (!hoverActive) {
            mutateAnnotations({
                action: "focusAnnotation",
                annotation: { id: null } as LindyAnnotation,
            });
        }

        window.top.postMessage({ event: "onAnnotationHoverUpdate", annotation, hoverActive }, "*");
    };
}
