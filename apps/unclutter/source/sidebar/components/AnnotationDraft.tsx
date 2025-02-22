import { copyTextToClipboard } from "@unclutter/library-components/dist/common/util";
import clsx from "clsx";
import debounce from "lodash/debounce";
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

import { LindyAnnotation } from "../../common/annotations/create";
import { deleteAnnotation, updateAnnotation } from "../common/CRUD";
import { SidebarContext } from "../context";

export interface AnnotationDraftProps {
    annotation: LindyAnnotation;
    className?: string;
    heightLimitPx?: number;
    isFetching?: boolean;
    relatedCount?: number;

    color: string;
    colorDark?: string;

    unfocusAnnotation: () => void;
}

export default function AnnotationDraft({
    annotation,
    className,
    heightLimitPx,
    isFetching,
    relatedCount,
    color,
    colorDark,
    unfocusAnnotation,
}: AnnotationDraftProps) {
    // const ref = useBlurRef(annotation, unfocusAnnotation);
    const inputRef = useRef<HTMLTextAreaElement>();
    const { userInfo } = useContext(SidebarContext);

    // focus on initial render
    useEffect(() => {
        if (annotation.focused) {
            inputRef.current?.focus();
        }
    }, [inputRef, annotation.focused]);

    // debounce local state and remote updates
    // debounce instead of throttle so that newest call eventually runs
    // @ts-ignore
    const debouncedUpdateApi: (annotation: LindyAnnotation) => Promise<LindyAnnotation> =
        useCallback(
            debounce((a) => {
                updateAnnotation(a);
            }, 1000),
            []
        );

    function extractHashtags(str: string): string[] {
        const words: string[] = str.split(' ');
        const hashtags: string[] = [];
        
        words.forEach((word: string, index: number) => {
            if (word.startsWith('#') && word.length > 1 && (!str.endsWith(word) || index !== words.length - 1)) {
            hashtags.push(word);
            }
        });
        
        return hashtags;
    }

    function updateTagsFromText(newAnnotation: LindyAnnotation) {
        // Check if there's possibly any hashtags in the text
        if (newAnnotation.text.indexOf('#') !== -1) {
            // Attempt to extract hashtags, but ignore one at the end of the text as that's where the user is
            // probably typing, and we want to ingore incomplete tags
            const extractedHashtags = extractHashtags(newAnnotation.text).map(s => s.substring(1));
            //console.log(`Extracted tags: ${extractedHashtags}`);

            const existingTags = newAnnotation.tags || [];
            const mergedTags = Array.from(new Set(existingTags.concat(extractedHashtags)));

            // Update the tags - if we didn't find any then we will fall back on existing tags
            newAnnotation.tags = mergedTags;
        }
    }
          

    // keep local state for faster updates
    const [localAnnotation, setLocalAnnotation] = React.useState(annotation);

    async function updateAnnotationLocalFirst(newAnnotation: LindyAnnotation) {
        updateTagsFromText(newAnnotation);
        // Ensure we remove hashtags from the text if they are aleady in there, but not if they occur at the end of the text (as we might be typing a new one)
        newAnnotation.tags.forEach(tagname => {
            const tagString = `#${tagname}`;
            if (newAnnotation.text.indexOf(tagString) !== -1 && !newAnnotation.text.endsWith(tagString)) {
                newAnnotation.text = newAnnotation.text.replace(new RegExp(`(\\s|^)${tagString}\\s`, 'gi'), ' ').trim();
            }
        });
        setLocalAnnotation(newAnnotation);

        if (!!annotation.text !== !!newAnnotation.text) {
            // changed visiblity
            // immediately update if added first text or removed text (impacts visibility)
            if (newAnnotation.text || newAnnotation.tags.length > 0) {
                updateAnnotation(newAnnotation);
            } else {
                deleteAnnotation(userInfo, newAnnotation);
            }
        } else {
            // call with newAnnotation as localAnnotation takes once loop iteration to update
            await debouncedUpdateApi(newAnnotation);
        }
    }

    return (
        <div
            className={clsx(
                `annotation annotation-draft relative rounded-l-sm rounded-r-md p-2 px-3 text-sm shadow`,
                annotation.focused && "focused",
                className
            )}
            style={{
                borderLeft: `8px solid ${color}`,
                // @ts-ignore
                "--dark-border-color": colorDark || color,
                maxHeight: heightLimitPx,
            }}
            // ref={ref}
        >
            <TextareaAutosize
                className="w-full select-none resize-none overflow-hidden bg-transparent align-top outline-none placeholder:select-none placeholder:text-stone-400 dark:placeholder:text-stone-600"
                placeholder={
                    userInfo?.aiEnabled
                        ? ""
                        : "Saved highlight text"
                }
                value={localAnnotation.text}
                onChange={(e) =>
                    updateAnnotationLocalFirst({
                        ...localAnnotation,
                        text: e.target.value,
                    })
                }
                onKeyDown={(e) => {
                    if (!localAnnotation.text && (e.key === "Backspace" || e.key === "Delete")) {
                        deleteAnnotation(userInfo, localAnnotation);
                    }
                }}
                minRows={1}
                maxRows={6}
                spellCheck={false}
                ref={inputRef}
                onBlur={unfocusAnnotation}
            />
            <hr/>
            <div className="leading-8">
                <br />
                {localAnnotation.tags.length > 0 ? "Tags: " : null}
                {localAnnotation.tags.map((tag) => (
                    <span key={tag} className="inline-block py-1 px-3 text-sm font-semibold text-white bg-gray-500 rounded-full break-words">
                        <span >#{tag} </span>
                        <button
                        onClick={() => updateAnnotationLocalFirst(
                            {
                                ...localAnnotation,
                                tags: localAnnotation.tags.filter(t => t !== tag),
                            }
                        )}><sup className="font-semibold text-red-900">X</sup></button>
                    </span>
                ))}
            </div>

            {isFetching ? (
                <div className="loader absolute right-3 top-[9px] h-4 w-4" />
            ) : (
                <div className="animate-fadein absolute top-[1px] right-1 flex gap-0 text-stone-400 dark:text-stone-600">
                    <svg
                        className="annotation-button h-8 cursor-pointer p-2"
                        viewBox="0 0 512 512"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => copyTextToClipboard(`"${annotation.quote_text}"`)}
                    >
                        <path
                            fill="currentColor"
                            d="M502.6 70.63l-61.25-61.25C435.4 3.371 427.2 0 418.7 0H255.1c-35.35 0-64 28.66-64 64l.0195 256C192 355.4 220.7 384 256 384h192c35.2 0 64-28.8 64-64V93.25C512 84.77 508.6 76.63 502.6 70.63zM464 320c0 8.836-7.164 16-16 16H255.1c-8.838 0-16-7.164-16-16L239.1 64.13c0-8.836 7.164-16 16-16h128L384 96c0 17.67 14.33 32 32 32h47.1V320zM272 448c0 8.836-7.164 16-16 16H63.1c-8.838 0-16-7.164-16-16L47.98 192.1c0-8.836 7.164-16 16-16H160V128H63.99c-35.35 0-64 28.65-64 64l.0098 256C.002 483.3 28.66 512 64 512h192c35.2 0 64-28.8 64-64v-32h-47.1L272 448z"
                        />
                    </svg>
                    <svg
                        className="annotation-button h-8 cursor-pointer p-2"
                        viewBox="0 0 448 512"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => deleteAnnotation(userInfo, annotation)}
                    >
                        <path
                            fill="currentColor"
                            d="M424 80C437.3 80 448 90.75 448 104C448 117.3 437.3 128 424 128H412.4L388.4 452.7C385.9 486.1 358.1 512 324.6 512H123.4C89.92 512 62.09 486.1 59.61 452.7L35.56 128H24C10.75 128 0 117.3 0 104C0 90.75 10.75 80 24 80H93.82L130.5 24.94C140.9 9.357 158.4 0 177.1 0H270.9C289.6 0 307.1 9.358 317.5 24.94L354.2 80H424zM177.1 48C174.5 48 171.1 49.34 170.5 51.56L151.5 80H296.5L277.5 51.56C276 49.34 273.5 48 270.9 48H177.1zM364.3 128H83.69L107.5 449.2C108.1 457.5 115.1 464 123.4 464H324.6C332.9 464 339.9 457.5 340.5 449.2L364.3 128z"
                        />
                    </svg>
                </div>
            )}
        </div>
    );
}

export function useBlurRef(annotation: LindyAnnotation, unfocusAnnotation: () => void) {
    // if annotation focused, detect clicks to unfocus it
    const ref = useRef<HTMLDivElement>();
    useEffect(() => {
        if (annotation.focused) {
            const onClick = (e) => {
                const clickTarget: HTMLElement = e.target;
                console.log("useBlurRef", clickTarget);

                // ignore actions performed on other annotations (e.g. deletes)
                if (
                    clickTarget?.className.includes("annotation") ||
                    clickTarget?.className.includes("dropdown") ||
                    clickTarget?.parentElement?.classList.contains("annotation")
                ) {
                    return;
                }

                if (ref.current && !ref.current.contains(clickTarget)) {
                    unfocusAnnotation();
                }
            };

            document.addEventListener("click", onClick, true);
            // window.addEventListener("blur", onClick, true);

            return () => {
                document.removeEventListener("click", onClick, true);
                // window.removeEventListener("blur", onClick, true);
            };
        }
    }, [annotation.focused]);

    return ref;
}
