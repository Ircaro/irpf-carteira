(function (raiz) {
  const NS = 'http://www.w3.org/2000/svg';
  const ALTURA = 240;
  const MARGEM = { topo: 18, direita: 16, base: 28, esquerda: 64 };

  function svg(tag, attrs = {}, pai) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (pai) pai.appendChild(el);
    return el;
  }

  function texto(pai, x, y, conteudo, attrs = {}) {
    const t = svg('text', { x, y, ...attrs }, pai);
    t.textContent = conteudo;
    return t;
  }

  function passoBonito(maximo, alvo = 4) {
    if (maximo <= 0) return 1;
    const bruto = maximo / alvo;
    const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    const r = bruto / mag;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  }

  function escalaY(minimo, maximo) {
    const passo = passoBonito(Math.max(Math.abs(minimo), Math.abs(maximo)) || 1);
    const topo = Math.max(passo, Math.ceil(maximo / passo) * passo);
    const fundo = minimo < 0 ? Math.floor(minimo / passo) * passo : 0;
    const ticks = [];
    for (let v = fundo; v <= topo + passo / 1000; v += passo) ticks.push(Number(v.toFixed(6)));
    return { fundo, topo, ticks };
  }

  function caminhoBarra(x, y, l, a, raio, paraCima = true) {
    const r = Math.max(0, Math.min(raio, l / 2, a));
    if (a <= 0) return '';
    if (paraCima) {
      return `M${x},${y + a}V${y + r}Q${x},${y} ${x + r},${y}H${x + l - r}Q${x + l},${y} ${x + l},${y + r}V${y + a}Z`;
    }
    return `M${x},${y}V${y + a - r}Q${x},${y + a} ${x + r},${y + a}H${x + l - r}Q${x + l},${y + a} ${x + l},${y + a - r}V${y}Z`;
  }

  function caminhoBarraH(x, y, l, a, raio, paraDireita = true) {
    const r = Math.max(0, Math.min(raio, a / 2, l));
    if (l <= 0) return '';
    if (paraDireita) {
      return `M${x},${y}H${x + l - r}Q${x + l},${y} ${x + l},${y + r}V${y + a - r}Q${x + l},${y + a} ${x + l - r},${y + a}H${x}Z`;
    }
    return `M${x + l},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + a - r}Q${x},${y + a} ${x + r},${y + a}H${x + l}Z`;
  }

  function prepararContainer(el) {
    el.innerHTML = '';
    el.classList.add('grafico');
    const dica = document.createElement('div');
    dica.className = 'dica';
    dica.hidden = true;
    el.appendChild(dica);
    return dica;
  }

  function mostrarDica(el, dica, x, y, titulo, linhas) {
    dica.replaceChildren();
    const t = document.createElement('div');
    t.className = 'dica-titulo';
    t.textContent = titulo;
    dica.appendChild(t);
    for (const l of linhas) {
      const linha = document.createElement('div');
      linha.className = 'dica-linha';
      if (l.cor) {
        const chave = document.createElement('span');
        chave.className = 'dica-chave';
        chave.style.background = l.cor;
        linha.appendChild(chave);
      }
      const valor = document.createElement('strong');
      valor.textContent = l.valor;
      linha.appendChild(valor);
      if (l.nome) {
        const nome = document.createElement('span');
        nome.textContent = l.nome;
        linha.appendChild(nome);
      }
      dica.appendChild(linha);
    }
    dica.hidden = false;
    const largura = el.clientWidth;
    const lDica = dica.offsetWidth;
    dica.style.left = `${Math.min(Math.max(x - lDica / 2, 0), largura - lDica)}px`;
    dica.style.top = `${Math.max(y - dica.offsetHeight - 10, 0)}px`;
  }

  function eixoY(g, escala, y, largura, formatoEixo) {
    for (const v of escala.ticks) {
      const yy = y(v);
      svg('line', { x1: MARGEM.esquerda, x2: largura - MARGEM.direita, y1: yy, y2: yy, class: v === 0 ? 'base' : 'grade' }, g);
      texto(g, MARGEM.esquerda - 8, yy + 4, formatoEixo(v), { class: 'eixo', 'text-anchor': 'end' });
    }
  }

  function colunas(el, opcoes) {
    const { categorias, series, formato, formatoEixo = formato, rotuloCategoria, rotuloEixoX } = opcoes;
    const dica = prepararContainer(el);
    const largura = Math.max(el.clientWidth, 280);
    const n = categorias.length;
    const totais = categorias.map((_, i) => series.reduce((t, s) => t + (s.valores[i] || 0), 0));
    const escala = escalaY(0, Math.max(...totais, 0));
    const plotW = largura - MARGEM.esquerda - MARGEM.direita;
    const plotH = ALTURA - MARGEM.topo - MARGEM.base;
    const y = v => MARGEM.topo + plotH - ((v - escala.fundo) / (escala.topo - escala.fundo)) * plotH;
    const banda = plotW / Math.max(n, 1);
    const barra = Math.max(1, Math.min(24, banda * 0.72));
    const raiz = svg('svg', { width: largura, height: ALTURA, viewBox: `0 0 ${largura} ${ALTURA}`, role: 'img', 'aria-label': opcoes.titulo || '' });
    el.insertBefore(raiz, dica);
    eixoY(raiz, escala, y, largura, formatoEixo);

    const grupos = [];
    categorias.forEach((cat, i) => {
      const x = MARGEM.esquerda + banda * i + (banda - barra) / 2;
      const g = svg('g', { class: 'coluna' }, raiz);
      let acumulado = 0;
      const ativas = series.map((s, k) => ({ s, k, v: s.valores[i] || 0 })).filter(o => o.v > 0);
      ativas.forEach((o, j) => {
        const base = y(acumulado);
        acumulado += o.v;
        const topo = y(acumulado);
        const ultimo = j === ativas.length - 1;
        const gap = j > 0 ? 2 : 0;
        const altura = Math.max(0, base - topo - gap);
        if (altura <= 0) return;
        if (ultimo) svg('path', { d: caminhoBarra(x, topo, barra, altura, 4), fill: o.s.cor }, g);
        else svg('rect', { x, y: topo, width: barra, height: altura, fill: o.s.cor }, g);
      });
      const alvo = svg('rect', { x: MARGEM.esquerda + banda * i, y: MARGEM.topo, width: banda, height: plotH, fill: 'transparent', tabindex: n <= 40 ? 0 : -1 }, g);
      const mostrar = () => {
        grupos.forEach(o => o.classList.toggle('apagado', o !== g));
        const linhas = series.length > 1
          ? [...series.map(s => ({ cor: s.cor, valor: formato(s.valores[i] || 0), nome: s.nome })), { valor: formato(totais[i]), nome: 'total' }]
          : [{ valor: formato(totais[i]) }];
        mostrarDica(el, dica, x + barra / 2, y(totais[i]), rotuloCategoria(cat), linhas);
      };
      const esconder = () => {
        grupos.forEach(o => o.classList.remove('apagado'));
        dica.hidden = true;
      };
      alvo.addEventListener('pointerenter', mostrar);
      alvo.addEventListener('focus', mostrar);
      alvo.addEventListener('pointerleave', esconder);
      alvo.addEventListener('blur', esconder);
      grupos.push(g);
      const rx = rotuloEixoX(cat, i);
      if (rx) texto(raiz, MARGEM.esquerda + banda * i + banda / 2, ALTURA - 8, rx, { class: 'eixo', 'text-anchor': 'middle' });
    });

    const iMax = totais.indexOf(Math.max(...totais));
    if (iMax >= 0 && totais[iMax] > 0) {
      const cx = MARGEM.esquerda + banda * iMax + banda / 2;
      const ancora = cx < MARGEM.esquerda + 40 ? 'start' : cx > largura - 60 ? 'end' : 'middle';
      texto(raiz, cx, y(totais[iMax]) - 6, formato(totais[iMax]), { class: 'rotulo-valor', 'text-anchor': ancora });
    }
  }

  function linha(el, opcoes) {
    const { categorias, valores, cor, formato, formatoEixo = formato, rotuloCategoria, rotuloEixoX } = opcoes;
    const dica = prepararContainer(el);
    const largura = Math.max(el.clientWidth, 280);
    const n = categorias.length;
    const escala = escalaY(Math.min(0, ...valores), Math.max(...valores, 0));
    const plotW = largura - MARGEM.esquerda - MARGEM.direita;
    const plotH = ALTURA - MARGEM.topo - MARGEM.base;
    const y = v => MARGEM.topo + plotH - ((v - escala.fundo) / (escala.topo - escala.fundo)) * plotH;
    const x = i => MARGEM.esquerda + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const raiz = svg('svg', { width: largura, height: ALTURA, viewBox: `0 0 ${largura} ${ALTURA}`, role: 'img', 'aria-label': opcoes.titulo || '' });
    el.insertBefore(raiz, dica);
    eixoY(raiz, escala, y, largura, formatoEixo);
    categorias.forEach((cat, i) => {
      const rx = rotuloEixoX(cat, i);
      if (rx) texto(raiz, x(i), ALTURA - 8, rx, { class: 'eixo', 'text-anchor': 'middle' });
    });

    const pontos = valores.map((v, i) => `${x(i)},${y(v)}`);
    svg('path', { d: `M${x(0)},${y(0)}L${pontos.join('L')}L${x(n - 1)},${y(0)}Z`, fill: cor, 'fill-opacity': 0.1 }, raiz);
    svg('path', { d: `M${pontos.join('L')}`, fill: 'none', stroke: cor, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, raiz);
    const ultimo = n - 1;
    svg('circle', { cx: x(ultimo), cy: y(valores[ultimo]), r: 4, fill: cor, stroke: 'var(--sup)', 'stroke-width': 2 }, raiz);
    texto(raiz, x(ultimo) - 8, y(valores[ultimo]) - 10, formato(valores[ultimo]), { class: 'rotulo-valor', 'text-anchor': 'end' });

    const mira = svg('line', { y1: MARGEM.topo, y2: MARGEM.topo + plotH, class: 'mira', visibility: 'hidden' }, raiz);
    const ponto = svg('circle', { r: 4, fill: cor, stroke: 'var(--sup)', 'stroke-width': 2, visibility: 'hidden' }, raiz);
    const area = svg('rect', { x: MARGEM.esquerda, y: MARGEM.topo, width: plotW, height: plotH, fill: 'transparent', tabindex: 0 }, raiz);
    let atual = ultimo;
    const mostrarEm = i => {
      atual = i;
      mira.setAttribute('x1', x(i));
      mira.setAttribute('x2', x(i));
      ponto.setAttribute('cx', x(i));
      ponto.setAttribute('cy', y(valores[i]));
      mira.setAttribute('visibility', 'visible');
      ponto.setAttribute('visibility', 'visible');
      mostrarDica(el, dica, x(i), y(valores[i]), rotuloCategoria(categorias[i]), [{ valor: formato(valores[i]) }]);
    };
    const esconder = () => {
      mira.setAttribute('visibility', 'hidden');
      ponto.setAttribute('visibility', 'hidden');
      dica.hidden = true;
    };
    area.addEventListener('pointermove', e => {
      const caixa = raiz.getBoundingClientRect();
      const px = ((e.clientX - caixa.left) / caixa.width) * largura;
      mostrarEm(Math.max(0, Math.min(n - 1, Math.round(((px - MARGEM.esquerda) / plotW) * (n - 1)))));
    });
    area.addEventListener('pointerleave', esconder);
    area.addEventListener('focus', () => mostrarEm(atual));
    area.addEventListener('blur', esconder);
    area.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') mostrarEm(Math.max(0, atual - 1));
      if (e.key === 'ArrowRight') mostrarEm(Math.min(n - 1, atual + 1));
    });
  }

  function barrasH(el, opcoes) {
    const { itens, formato, corPositiva, corNegativa = corPositiva } = opcoes;
    const dica = prepararContainer(el);
    const largura = Math.max(el.clientWidth, 280);
    const linhaAltura = 30;
    const espessura = 16;
    const esquerda = 72;
    const reservaValor = 96;
    const altura = itens.length * linhaAltura + 8;
    const minimo = Math.min(0, ...itens.map(i => i.valor));
    const maximo = Math.max(0, ...itens.map(i => i.valor));
    const plotW = largura - esquerda - reservaValor * (minimo < 0 ? 2 : 1);
    const amplitude = maximo - minimo || 1;
    const x0 = esquerda + (minimo < 0 ? reservaValor : 0) + (-minimo / amplitude) * plotW;
    const escala = v => (Math.abs(v) / amplitude) * plotW;
    const raiz = svg('svg', { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, role: 'img', 'aria-label': opcoes.titulo || '' });
    el.insertBefore(raiz, dica);
    svg('line', { x1: x0, x2: x0, y1: 0, y2: altura, class: 'base' }, raiz);

    const grupos = [];
    itens.forEach((item, i) => {
      const yy = i * linhaAltura + 4;
      const yBarra = yy + (linhaAltura - espessura) / 2;
      const g = svg('g', { class: 'coluna' }, raiz);
      texto(g, 0, yy + linhaAltura / 2 + 5, item.rotulo, { class: 'rotulo-categoria' });
      const l = escala(item.valor);
      const positivo = item.valor >= 0;
      if (l > 0) {
        svg('path', { d: caminhoBarraH(positivo ? x0 : x0 - l, yBarra, l, espessura, 4, positivo), fill: positivo ? corPositiva : corNegativa }, g);
      }
      const tx = positivo ? x0 + l + 6 : x0 - l - 6;
      texto(g, tx, yy + linhaAltura / 2 + 5, item.rotuloValor || formato(item.valor), { class: 'rotulo-valor', 'text-anchor': positivo ? 'start' : 'end' });
      const alvo = svg('rect', { x: 0, y: yy, width: largura, height: linhaAltura, fill: 'transparent', tabindex: 0 }, g);
      const mostrar = () => {
        grupos.forEach(o => o.classList.toggle('apagado', o !== g));
        mostrarDica(el, dica, positivo ? x0 + l : x0 - l, yBarra, item.rotulo, item.detalhe || [{ valor: formato(item.valor) }]);
      };
      const esconder = () => {
        grupos.forEach(o => o.classList.remove('apagado'));
        dica.hidden = true;
      };
      alvo.addEventListener('pointerenter', mostrar);
      alvo.addEventListener('focus', mostrar);
      alvo.addEventListener('pointerleave', esconder);
      alvo.addEventListener('blur', esconder);
      grupos.push(g);
    });
  }

  raiz.Graficos = { colunas, linha, barrasH, escalaY };
})(this);
