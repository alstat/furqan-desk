<script lang="ts">
    import hljs from "highlight.js/lib/core";
    import javascript from "highlight.js/lib/languages/javascript";
    import r from "highlight.js/lib/languages/r";
    import python from "highlight.js/lib/languages/python";
    import julia from "highlight.js/lib/languages/julia";
    import typescript from "highlight.js/lib/languages/typescript";
    import css from "highlight.js/lib/languages/css";
    import html from "highlight.js/lib/languages/xml";
    import sql from "highlight.js/lib/languages/sql";
    import json from "highlight.js/lib/languages/json";
    import yaml from "highlight.js/lib/languages/yaml";
    import bash from "highlight.js/lib/languages/bash";

    hljs.registerLanguage("javascript", javascript);
    hljs.registerLanguage("r", r);
    hljs.registerLanguage("python", python);
    hljs.registerLanguage("julia", julia);
    hljs.registerLanguage("typescript", typescript);
    hljs.registerLanguage("css", css);
    hljs.registerLanguage("html", html);
    hljs.registerLanguage("sql", sql);
    hljs.registerLanguage("json", json);
    hljs.registerLanguage("yaml", yaml);
    hljs.registerLanguage("bash", bash);

    import {onMount} from "svelte";

    interface Props {
        codeDOM: HTMLElement;
    }

    let { codeDOM }: Props = $props();

    onMount(() => {
       hljs.highlightElement(codeDOM); 
    });
</script>

<!-- {codeDOM} -->