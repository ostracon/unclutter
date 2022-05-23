import { overrideClassname } from "../common/stylesheets";
import { getDomainFrom } from "../common/util";
import AnnotationsModifier from "./modifications/annotations/annotationsModifier";
import BackgroundModifier from "./modifications/background";
import BodyStyleModifier from "./modifications/bodyStyle";
import ContentBlockModifier from "./modifications/contentBlock";
import ResponsiveStyleModifier from "./modifications/CSSOM/responsiveStyle";
import StylePatchesModifier from "./modifications/CSSOM/stylePatches";
import ThemeModifier from "./modifications/CSSOM/theme";
import CSSOMProvider from "./modifications/CSSOM/_provider";
import ReadingTimeModifier from "./modifications/DOM/readingTime";
import TextContainerModifier from "./modifications/DOM/textContainer";
import OverlayManager from "./modifications/overlay";
import {
    PageModifier,
    trackModifierExecution,
} from "./modifications/_interface";

@trackModifierExecution
export default class TransitionManager implements PageModifier {
    private domain = getDomainFrom(new URL(window.location.href));

    private cssomProvider = new CSSOMProvider();

    private contentBlockModifier = new ContentBlockModifier();
    private bodyStyleModifier = new BodyStyleModifier();
    private responsiveStyleModifier = new ResponsiveStyleModifier();
    private stylePatchesModifier = new StylePatchesModifier(this.cssomProvider);
    private annotationsModifier = new AnnotationsModifier();
    private textContainerModifier = new TextContainerModifier();
    private backgroundModifier = new BackgroundModifier(
        this.textContainerModifier
    );
    private themeModifier = new ThemeModifier(
        this.cssomProvider,
        this.annotationsModifier,
        this.textContainerModifier
    );
    private overlayManager = new OverlayManager(
        this.domain,
        this.themeModifier,
        this.annotationsModifier
    );

    private readingTimeModifier = new ReadingTimeModifier(this.overlayManager);

    async prepare() {
        // fetching CSS may take some time, so run other things in parallel
        await Promise.all([
            // handle CSS
            (async () => {
                // fetch CSS stylesheets if required
                await this.cssomProvider.prepare();
                // iterate CSS stylesheets
                await this.responsiveStyleModifier.prepare(this.cssomProvider);
            })(),
            // iterate DOM
            this.textContainerModifier.prepare(),
            // get active theme state
            this.themeModifier.prepare(this.domain),
        ]);
    }

    // visually fade out noisy elements
    fadeOutNoise() {
        // inserts new stylesheets which trigger ~50ms reflow
        this.contentBlockModifier.fadeOutNoise();
        this.responsiveStyleModifier.fadeOutNoise();
    }

    // prepare upcoming transition
    duringFadeOut() {
        // order is important -- should only trigger one reflow for background insert & text baseline styles

        // parse text background colors, insert background
        this.textContainerModifier.fadeOutNoise();
        this.backgroundModifier.fadeOutNoise();
        // set background dark if dark mode enabled, configure font size variable
        this.themeModifier.transitionIn();

        // insert baseline styles to animate text movement (don't read DOM here)
        this.textContainerModifier.prepareAnimation();
    }

    // pageview width change is triggered just before calling this
    transitionIn() {
        // remove faded-out elements
        this.contentBlockModifier.transitionIn();
        this.responsiveStyleModifier.transitionIn();

        // enable site mobile styles
        // this shifts layout and is often not animation-friendly
        this.responsiveStyleModifier.enableResponsiveStyles();

        // adjust font size
        this.textContainerModifier.transitionIn();

        // adjust text containers
        this.textContainerModifier.afterTransitionIn();

        // patch inline styles to overcome stubborn sites
        // this immediately applies the pageview style
        this.bodyStyleModifier.transitionIn();
        this.stylePatchesModifier.afterTransitionIn();

        // to look nice, all layout shifts should be done in this phase
    }

    async afterTransitionIn() {
        // use quicker animation for dark mode or user theme changes from now on
        document.body.style.transition = `all 0.4s cubic-bezier(0.87, 0, 0.13, 1)`;

        // show UI
        // needs to be run before themeModifier to set correct auto theme value
        await this.overlayManager.afterTransitionIn();

        // apply color theme - potentially expensive
        await this.themeModifier.afterTransitionIn();

        // UI enhancements, can show up later
        this.annotationsModifier.afterTransitionIn(); // annotations fetch may take another 500ms
        this.readingTimeModifier.afterTransitionIn();
    }

    async transitionOut() {
        // TODO enable animation inline? preparePageviewAnimation()

        await this.annotationsModifier.transitionOut();

        await this.responsiveStyleModifier.transitionOut();
        await this.textContainerModifier.transitionOut();

        await this.contentBlockModifier.transitionOut();
        await this.overlayManager.transitionOut();
        await this.themeModifier.transitionOut();

        document.documentElement.classList.remove("pageview");
    }

    async fadeinNoise() {
        await this.responsiveStyleModifier.fadeInNoise();
        await this.contentBlockModifier.fadeInNoise();

        await this.cssomProvider.reenableOriginalStylesheets();
    }

    async afterTransitionOut() {
        await this.overlayManager.afterTransitionOut();

        // remove rest
        document
            .querySelectorAll(`.${overrideClassname}`)
            .forEach((e) => e.remove());

        // final cleanup, includes removing animation settings
        await this.bodyStyleModifier.afterTransitionOut();
    }
}
