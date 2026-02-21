import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Tag } from '@lezer/highlight';

// have to declare the tags, otherwise we get codemirror warnings that they're unknown highlighting tokens
const trackerTags = {
  timestamp: Tag.define(),
  bullet: Tag.define(),
  scm: Tag.define(),
  todoDone: Tag.define(),
  todoCanceled: Tag.define(),
  todoLater: Tag.define(),
  todoDoing: Tag.define(),
  codeblock: Tag.define(),
  code: Tag.define(),
  url: Tag.define(),
  hashTag: Tag.define(),
  mention: Tag.define()
};

function toKebabCase(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function isWhitespaceOrBoundary(char) {
  return char == null || /\s/.test(char);
}

const ID_TOKEN_SPECS = [
  { prefix: '#', token: 'hashTag' },
  { prefix: '@', token: 'mention' }
];

function readStandaloneToken(stream, specs, bodyPattern = /[\w.-]/) {
  const start = stream.pos;

  for (const { prefix, token } of specs) {
    if (!stream.string.startsWith(prefix, start)) continue;

    const prevChar = start > 0 ? stream.string[start - 1] : null;
    if (!isWhitespaceOrBoundary(prevChar)) {
      stream.pos = start;
      continue;
    }

    stream.pos = start + prefix.length;
    while (stream.match(bodyPattern)) {}

    const nextChar = stream.pos < stream.string.length ? stream.string[stream.pos] : null;
    const hasBody = stream.pos > start + prefix.length;
    if (hasBody && isWhitespaceOrBoundary(nextChar)) {
      return token;
    }

    stream.pos = start;
  }

  return null;
}

// build styles for the tracker tags
const trackerHighlightStyle = HighlightStyle.define(
  Object.entries(trackerTags).map(([key, tag]) => ({
    tag,
    class: `cm-tok-${toKebabCase(key)}`
  }))
);

// Define the language using StreamLanguage for line-based patterns
export const trackerLanguage = StreamLanguage.define({
  tokenTable: trackerTags,
  token(stream) {
    // Start-of-line markers after indentation
    if (stream.sol()) {
      stream.eatSpace();

      if (stream.match(/\d{2}:\d{2}\s+\d{4}-\d{2}-\d{2}/)) {
        return 'timestamp';
      }

      if (stream.match(/[-*~]/) || stream.match(/\.:/)) {
        return 'bullet';
      }

      if (stream.match(/(?:GIT|SVN|SCM|VCS|AWS):/)) {
        return 'scm';
      }
    }

    // TODO markers
    if (stream.match(/\[✔\]|\[v\]/)) {
      return 'todoDone';
    }
    if (stream.match(/\[x\]/)) {
      return 'todoCanceled';
    }
    if (stream.match(/\[ \]/)) {
      return 'todoLater';
    }
    if (stream.match(/\[~\]/)) {
      return 'todoDoing';
    }

    // Code blocks { ... }
    if (stream.match(/\{[^}]*\}/)) {
      return 'codeblock';
    }

    // Inline code `...`
    if (stream.match(/`[^`]+`/)) {
      return 'code';
    }

    // URLs
    if (stream.match(/https?:\/\/[^\s\t]+/)) {
      return 'url';
    }

    const idToken = readStandaloneToken(stream, ID_TOKEN_SPECS);
    if (idToken) {
      return idToken;
    }

    // Default: skip character
    stream.next();
    return null;
  }
});

export const trackerSyntax = [trackerLanguage, syntaxHighlighting(trackerHighlightStyle)];
