const zlib = require('node:zlib');

function lerZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Arquivo não é um .xlsx válido');

  const total = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  const arquivos = {};
  for (let i = 0; i < total; i++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('Estrutura do .xlsx corrompida');
    const metodo = buffer.readUInt16LE(p + 10);
    const tamanho = buffer.readUInt32LE(p + 20);
    const tamNome = buffer.readUInt16LE(p + 28);
    const tamExtra = buffer.readUInt16LE(p + 30);
    const tamComentario = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const nome = buffer.toString('utf8', p + 46, p + 46 + tamNome);
    const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const dados = buffer.subarray(inicio, inicio + tamanho);
    arquivos[nome] = () => (metodo === 0 ? dados : zlib.inflateRawSync(dados)).toString('utf8');
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return arquivos;
}

function decodificar(texto) {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const atributo = (tag, nome) => {
  const m = tag.match(new RegExp(`\\b${nome}="([^"]*)"`));
  return m ? decodificar(m[1]) : undefined;
};

const textos = xml => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => decodificar(m[1])).join('');

function indiceColuna(ref) {
  const letras = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function lerPlanilha(xml, compartilhadas) {
  const linhas = [];
  for (const [, conteudo] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const linha = [];
    let proxima = 0;
    for (const [, attrs, corpo = ''] of conteudo.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = atributo(attrs, 'r');
      const col = ref ? indiceColuna(ref) : proxima;
      proxima = col + 1;
      const tipo = atributo(attrs, 't');
      const v = corpo.match(/<v>([\s\S]*?)<\/v>/);
      let valor = null;
      if (tipo === 's' && v) valor = compartilhadas[Number(v[1])];
      else if (tipo === 'inlineStr') valor = textos(corpo);
      else if (tipo === 'str' && v) valor = decodificar(v[1]);
      else if (tipo === 'b' && v) valor = v[1] === '1';
      else if (v) valor = Number(v[1]);
      linha[col] = valor;
    }
    linhas.push(Array.from(linha, x => (x === undefined ? null : x)));
  }
  return linhas;
}

function lerXlsx(buffer) {
  const zip = lerZip(buffer);
  const ler = nome => (zip[nome] ? zip[nome]() : '');
  const compartilhadas = [...ler('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textos(m[1]));
  const rels = {};
  for (const [tag] of ler('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    rels[atributo(tag, 'Id')] = atributo(tag, 'Target');
  }
  return [...ler('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map(([tag]) => {
    const alvo = rels[atributo(tag, 'r:id')] || '';
    const caminho = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`;
    return { nome: atributo(tag, 'name'), linhas: lerPlanilha(ler(caminho), compartilhadas) };
  });
}

module.exports = { lerXlsx };
