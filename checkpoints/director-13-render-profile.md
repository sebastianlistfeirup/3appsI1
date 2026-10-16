# Director checkpoint 13 — faktisk renderberedskab

Skrevet: delt, tidsbegrænset renderprofil; lokal GET/POST-integration; tilgængelighed med fejl/genkontrol i editor; dokumentation og native/browser-regressioner.

Udført: virkelig 30-frame H.264/AAC-prøve med crossfade, dansk font, FFprobe, afkodning og EBU R128. Testen afslørede FFmpegs tavse fallback ved ugyldig font; løsningen kræver også fontkit-afkodning af danske glyph-kurver. Manglende FFmpeg afprøves mod en rigtig produktionsserver med isoleret PATH og efterfølgende genopretning i samme browser.

Verificeret: native profil-suite med FFmpeg 7.1.5 og 6.1.1; 67 eksisterende domæne/app-units; TypeScript; produktionsbuild uden advarsler. Tre browsermotorer, tre responsive størrelser og ni axe-scans. Rapporter: `reports/director/render-profile.json` og `*-render-profile-flow.json`, screenshots samme præfiks.

Tilkoblet: kun lokal, opt-in FFmpeg. Ingen ekstern tjeneste, konto, betaling eller cloud. Profilprøven erstatter ikke individuel projekt-/filmvalidering. Kontroller cachelagres højst fem minutter og kan genkontrolleres med ti sekunders minimumsinterval; et værktøj kan stadig fejle senere under en reel eksport.
