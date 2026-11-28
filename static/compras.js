const el = id => document.getElementById(id);
const moeda = new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"});
function texto(pai, tag, valor) {
  const node = document.createElement(tag);
  node.textContent = valor;
  pai.append(node);
  return node;
}
function link(pai, titulo, url) {
  const a = texto(pai, "a", titulo);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
}
function exibir(ofertas) {
  const lista = el("lista");
  lista.replaceChildren();
  if (!ofertas.length) texto(lista, "p", "Nenhuma oferta confirmada dentro dos seus critérios. Volte para ajustar a pesquisa.");
  for (const item of ofertas) {
    const card = document.createElement("article");
    lista.append(card);
    texto(card, "h2", item.modelo);
    const frete = item.frete == null ? "Frete a confirmar" : item.frete === 0 ? "Frete grátis" : "Frete de " + moeda.format(item.frete);
    texto(card, "p", moeda.format(item.preco) + " · " + item.loja + " · " + frete);
    for (const [campo, titulo] of [["vantagens", "Por que vale a pena"], ["ressalvas", "Pontos de atenção"], ["avaliacoes", "O que dizem os compradores"]]) {
      if (!item[campo].length) {
        if (campo === "avaliacoes") texto(card, "p", "Avaliações deste modelo sem confirmação.");
        continue;
      }
      texto(card, "h3", titulo);
      const ul = texto(card, "ul", "");
      for (const fato of item[campo]) link(texto(ul, "li", fato.texto + " "), "Fonte", fato.url);
    }
    link(card, "Ver oferta na loja", item.url);
  }
}
function navegar() {
  const resultado = Boolean(history.state?.compras && el("lista").childElementCount);
  el("resultado").hidden = !resultado;
  el("voltar").hidden = !resultado;
  el("entrada").hidden = resultado;
  (resultado ? document.querySelector("#resultado h1") : el("produto")).focus();
}
el("voltar").onclick = () => history.back();
window.addEventListener("popstate", navegar);
document.querySelector("form").onsubmit = async event => {
  event.preventDefault();
  const botao = event.currentTarget.querySelector("button");
  if (botao.disabled) return;
  botao.disabled = true;
  el("status").textContent = "Pesquisando preços, especificações e avaliações…";
  try {
    const resposta = await fetch("/api/compras", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({produto:el("produto").value.trim(), teto:el("teto").valueAsNumber})});
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(typeof dados.detail === "string" ? dados.detail : "Confira a descrição e o orçamento.");
    exibir(dados.ofertas);
    el("status").textContent = "";
    history.pushState({compras:true}, "", "#resultados");
    navegar();
  } catch (erro) {
    el("status").textContent = erro instanceof SyntaxError || erro instanceof TypeError ? "Não foi possível acessar a pesquisa. Tente novamente." : erro.message;
  } finally {
    botao.disabled = false;
  }
};
