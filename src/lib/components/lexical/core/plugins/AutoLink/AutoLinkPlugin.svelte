<script lang="ts">
  import AutoLinkPluginCore from './AutoLinkPluginCore.svelte';

  export function createLinkMatcherWithRegExp(
    regExp: RegExp,
    urlTransformer: (text: string) => string = (text) => text,
  ) {
    return (text: string) => {
      const match = regExp.exec(text);
      if (match === null) {
        return null;
      }
      return {
        index: match.index,
        length: match[0].length,
        text: match[0],
        url: urlTransformer(match[0]),
      };
    };
  }

  // A trailing `- . + ( ) : %` is punctuation around the link, not part of it.
  // That used to be a `(?<![-.+():%])` at the end, but WebKit before Safari
  // 16.4 rejects lookbehind while parsing the module — the whole chunk dies
  // with "invalid regular expression: invalid group specifier name". Spelling
  // the same rule as "the last character matched must not be one of those"
  // keeps it to syntax every engine we ship on understands: both the path and
  // the TLD are now written as "any of the allowed characters, ending on one
  // that may finish a link".
  const URL_REGEX =
    /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{0,5}[a-zA-Z0-9]\b((?:[-a-zA-Z0-9()@:%_+.~#?&//=]*[a-zA-Z0-9@_~#?&/=])?)/;

  const EMAIL_REGEX =
    /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;

  const MATCHERS = [
    createLinkMatcherWithRegExp(URL_REGEX, (text) => {
      return text.startsWith('http') ? text : `https://${text}`;
    }),
    createLinkMatcherWithRegExp(EMAIL_REGEX, (text) => {
      return `mailto:${text}`;
    }),
  ];
</script>

<AutoLinkPluginCore matchers={MATCHERS} />
