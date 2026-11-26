// Minimal non-validating XML parser that builds a tree shaped like System.Xml.XmlDocument
// loaded with PreserveWhitespace = true. Only what the subtitle readers need is implemented:
// elements, attributes, text, whitespace, CDATA, comments and processing instructions.
// Malformed documents throw, as XmlDocument.Load does.

export const XmlNodeType = Object.freeze({
  Element: 'Element',
  Text: 'Text',
  CDATA: 'CDATA',
  Whitespace: 'Whitespace',
  SignificantWhitespace: 'SignificantWhitespace',
  Comment: 'Comment',
  ProcessingInstruction: 'ProcessingInstruction',
});

export class XmlElement {
  constructor(name, namespaceUri) {
    this.nodeType = XmlNodeType.Element;
    this.name = name;
    const colon = name.indexOf(':');
    this.prefix = colon >= 0 ? name.substring(0, colon) : '';
    this.localName = colon >= 0 ? name.substring(colon + 1) : name;
    this.namespaceUri = namespaceUri;
    /** @type {Map<string, string>} attributes by qualified name */
    this.attributes = new Map();
    /** @type {Array<XmlElement | XmlCharacterNode>} */
    this.childNodes = [];
  }

  /** XmlElement.Attributes[name]?.Value */
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  get children() {
    return this.childNodes.filter((n) => n.nodeType === XmlNodeType.Element);
  }

  /** XmlNode.InnerText: the concatenated text of all descendant text, CDATA and whitespace nodes. */
  get innerText() {
    let text = '';
    for (const node of this.childNodes) {
      if (node.nodeType === XmlNodeType.Element) text += node.innerText;
      else if (node.nodeType !== XmlNodeType.Comment && node.nodeType !== XmlNodeType.ProcessingInstruction) text += node.value;
    }
    return text;
  }
}

class XmlCharacterNode {
  constructor(nodeType, value) {
    this.nodeType = nodeType;
    this.value = value;
  }
}

const NAME_START = /[A-Za-z_:À-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\uD800-\uDBFF]/;
const NAME_CHAR = /[-.0-9·̀-ͯ‿⁀A-Za-z_:À-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\uD800-\uDFFF]/;
// eslint-disable-next-line no-control-regex
const INVALID_CHAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;
const PREDEFINED_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function isXmlWhitespace(s) {
  return /^[ \t\r\n]*$/.test(s);
}

/**
 * Parses an XML document and returns its root element.
 * @param {string} text
 * @returns {XmlElement}
 */
export function parseXml(text) {
  return new Parser(text).parseDocument();
}

class Parser {
  constructor(text) {
    // End-of-line handling (XML 1.0 section 2.11): literal CRLF and CR become LF before parsing.
    this.s = text.replace(/\r\n?/g, '\n');
    this.pos = 0;
  }

  error(message) {
    const before = this.s.substring(0, this.pos);
    const line = before.split('\n').length;
    const col = this.pos - before.lastIndexOf('\n');
    return new Error(`XML inválido (linha ${line}, coluna ${col}): ${message}`);
  }

  startsWith(str) {
    return this.s.startsWith(str, this.pos);
  }

  expect(str) {
    if (!this.startsWith(str)) throw this.error(`esperado "${str}"`);
    this.pos += str.length;
  }

  skipWhitespace() {
    const start = this.pos;
    while (this.pos < this.s.length && ' \t\n'.includes(this.s[this.pos])) this.pos++;
    return this.pos > start;
  }

  readName() {
    const start = this.pos;
    if (this.pos >= this.s.length || !NAME_START.test(this.s[this.pos])) throw this.error('nome esperado');
    this.pos++;
    while (this.pos < this.s.length && NAME_CHAR.test(this.s[this.pos])) this.pos++;
    return this.s.substring(start, this.pos);
  }

  readUntil(terminator, what) {
    const end = this.s.indexOf(terminator, this.pos);
    if (end < 0) throw this.error(`${what} não terminado`);
    const value = this.s.substring(this.pos, end);
    this.pos = end + terminator.length;
    return value;
  }

  parseDocument() {
    if (this.startsWith('<?xml') && /[\s?]/.test(this.s[this.pos + 5] ?? '')) {
      this.pos += 5;
      this.readUntil('?>', 'declaração XML');
    }

    let root = null;
    while (true) {
      this.skipWhitespace();
      if (this.pos >= this.s.length) break;
      if (this.startsWith('<!--')) this.parseComment();
      else if (this.startsWith('<?')) this.parseProcessingInstruction();
      else if (this.startsWith('<!DOCTYPE')) {
        if (root) throw this.error('DOCTYPE depois do elemento raiz');
        this.skipDoctype();
      } else if (this.startsWith('<')) {
        if (root) throw this.error('mais de um elemento raiz');
        root = this.parseElement(new Map([['xml', 'http://www.w3.org/XML/1998/namespace'], ['', '']]), false);
      } else throw this.error('texto fora do elemento raiz');
    }
    if (!root) throw this.error('elemento raiz ausente');
    return root;
  }

  skipDoctype() {
    this.pos += '<!DOCTYPE'.length;
    let depth = 0;
    while (this.pos < this.s.length) {
      const c = this.s[this.pos++];
      if (c === '"' || c === "'") this.readUntil(c, 'literal');
      else if (c === '[') depth++;
      else if (c === ']') depth--;
      else if (c === '>' && depth === 0) return;
    }
    throw this.error('DOCTYPE não terminado');
  }

  parseComment() {
    this.pos += 4;
    const value = this.readUntil('-->', 'comentário');
    if (value.includes('--') || value.endsWith('-')) throw this.error('"--" dentro de comentário');
    return new XmlCharacterNode(XmlNodeType.Comment, value);
  }

  parseProcessingInstruction() {
    this.pos += 2;
    const target = this.readName();
    if (target.toLowerCase() === 'xml') throw this.error('declaração XML fora do início');
    const value = this.readUntil('?>', 'instrução de processamento');
    return new XmlCharacterNode(XmlNodeType.ProcessingInstruction, value.replace(/^[ \t\n]+/, ''));
  }

  /** Reads a reference starting at "&" and returns the replacement text. */
  readReference() {
    this.pos++;
    const end = this.s.indexOf(';', this.pos);
    if (end < 0) throw this.error('referência não terminada');
    const ref = this.s.substring(this.pos, end);
    this.pos = end + 1;

    if (ref.startsWith('#')) {
      const code = /^#x[0-9a-fA-F]+$/.test(ref) ? parseInt(ref.substring(2), 16) : /^#[0-9]+$/.test(ref) ? parseInt(ref.substring(1), 10) : NaN;
      if (!(code >= 0 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) throw this.error(`referência de caractere inválida &${ref};`);
      const ch = String.fromCodePoint(code);
      if (INVALID_CHAR.test(ch)) throw this.error(`caractere inválido &${ref};`);
      return ch;
    }
    if (!(ref in PREDEFINED_ENTITIES)) throw this.error(`entidade não declarada &${ref};`);
    return PREDEFINED_ENTITIES[ref];
  }

  readAttributeValue() {
    const quote = this.s[this.pos];
    if (quote !== '"' && quote !== "'") throw this.error('valor de atributo esperado');
    this.pos++;
    let value = '';
    while (true) {
      if (this.pos >= this.s.length) throw this.error('valor de atributo não terminado');
      const c = this.s[this.pos];
      if (c === quote) {
        this.pos++;
        return value;
      }
      if (c === '<') throw this.error('"<" em valor de atributo');
      if (c === '&') {
        value += this.readReference();
        continue;
      }
      if (INVALID_CHAR.test(c)) throw this.error('caractere inválido');
      // Attribute-value normalization: literal whitespace characters become spaces
      value += c === '\t' || c === '\n' ? ' ' : c;
      this.pos++;
    }
  }

  parseElement(parentNamespaces, preserveSpace) {
    this.expect('<');
    const name = this.readName();
    const rawAttributes = [];
    while (true) {
      const hadSpace = this.skipWhitespace();
      if (this.startsWith('/>') || this.startsWith('>')) break;
      if (!hadSpace) throw this.error('espaço esperado entre atributos');
      const attrName = this.readName();
      this.skipWhitespace();
      this.expect('=');
      this.skipWhitespace();
      const value = this.readAttributeValue();
      if (rawAttributes.some((a) => a.name === attrName)) throw this.error(`atributo duplicado "${attrName}"`);
      rawAttributes.push({ name: attrName, value });
    }

    let namespaces = parentNamespaces;
    for (const { name: attrName, value } of rawAttributes) {
      if (attrName === 'xmlns' || attrName.startsWith('xmlns:')) {
        if (namespaces === parentNamespaces) namespaces = new Map(parentNamespaces);
        namespaces.set(attrName === 'xmlns' ? '' : attrName.substring(6), value);
      } else if (attrName === 'xml:space') {
        preserveSpace = value === 'preserve' ? true : value === 'default' ? false : preserveSpace;
      }
    }

    const colon = name.indexOf(':');
    const prefix = colon >= 0 ? name.substring(0, colon) : '';
    if (!namespaces.has(prefix)) throw this.error(`prefixo de namespace não declarado "${prefix}"`);
    const element = new XmlElement(name, namespaces.get(prefix));
    for (const { name: attrName, value } of rawAttributes) element.attributes.set(attrName, value);

    if (this.startsWith('/>')) {
      this.pos += 2;
      return element;
    }
    this.pos++;

    let text = '';
    const flushText = () => {
      if (text === '') return;
      const type = !isXmlWhitespace(text) ? XmlNodeType.Text : preserveSpace ? XmlNodeType.SignificantWhitespace : XmlNodeType.Whitespace;
      element.childNodes.push(new XmlCharacterNode(type, text));
      text = '';
    };

    while (true) {
      if (this.pos >= this.s.length) throw this.error(`elemento "${name}" não fechado`);
      const c = this.s[this.pos];
      if (c === '<') {
        if (this.startsWith('</')) {
          flushText();
          this.pos += 2;
          const closing = this.readName();
          if (closing !== name) throw this.error(`esperado </${name}>, encontrado </${closing}>`);
          this.skipWhitespace();
          this.expect('>');
          return element;
        }
        flushText();
        if (this.startsWith('<!--')) element.childNodes.push(this.parseComment());
        else if (this.startsWith('<![CDATA[')) {
          this.pos += 9;
          element.childNodes.push(new XmlCharacterNode(XmlNodeType.CDATA, this.readUntil(']]>', 'CDATA')));
        } else if (this.startsWith('<?')) element.childNodes.push(this.parseProcessingInstruction());
        else element.childNodes.push(this.parseElement(namespaces, preserveSpace));
      } else if (c === '&') {
        text += this.readReference();
      } else {
        if (INVALID_CHAR.test(c)) throw this.error('caractere inválido');
        if (c === ']' && this.startsWith(']]>')) throw this.error('"]]>" em texto');
        text += c;
        this.pos++;
      }
    }
  }
}
