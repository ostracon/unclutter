import { getDomainFrom } from "source/common/util";
import { overrideClassname } from "../common/stylesheets";
import BackgroundModifier from "./modifications/background";
import BodyStyleModifier from "./modifications/bodyStyle";
import ContentBlockModifier from "./modifications/contentBlock";
import ResponsiveStyleModifier from "./modifications/CSSOM/responsiveStyle";
import StylePatchesModifier from "./modifications/CSSOM/stylePatches";
import ThemeModifier from "./modifications/CSSOM/theme";
import CSSOMProvider from "./modifications/CSSOM/_provider";
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

    private backgroundModifier = new BackgroundModifier();
    private contentBlockModifier = new ContentBlockModifier();
    private bodyStyleModifier = new BodyStyleModifier();
    private responsiveStyleModifier = new ResponsiveStyleModifier();
    private stylePatchesModifier = new StylePatchesModifier(this.cssomProvider);
    private themeModifier = new ThemeModifier(this.cssomProvider);
    private overlayManager = new OverlayManager(
        this.domain,
        this.themeModifier
    );
    private textContainerModifier = new TextContainerModifier(
        this.themeModifier
    );

    async prepare() {
        await this.cssomProvider.prepare();
        await this.responsiveStyleModifier.prepare(this.cssomProvider);
        await this.textContainerModifier.prepare();
        await this.themeModifier.prepare(this.domain);
    }

    fadeOutNoise() {
        // do content block first as it shows changes immediately
        this.contentBlockModifier.fadeOutNoise();

        this.responsiveStyleModifier.fadeOutNoise();
        this.textContainerModifier.fadeOutNoise();

        this.backgroundModifier.fadeOutNoise();
    }

    async transitionIn() {
        document.body.style.setProperty("transition", "all 0.2s");

        await this.themeModifier.transitionIn();

        await this.contentBlockModifier.transitionIn();

        await this.responsiveStyleModifier.transitionIn();
        await this.textContainerModifier.transitionIn(); // TODO how to make transition from original position

        await this.bodyStyleModifier.transitionIn();
        await this.overlayManager.transitionIn();
    }

    async afterTransitionIn() {
        await this.overlayManager.afterTransitionIn(); // needs to run before themeModifier to set correct auto theme value

        await this.themeModifier.afterTransitionIn();
        await this.stylePatchesModifier.afterTransitionIn();
    }

    async transitionOut() {
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
