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
  a.href = "/api/compras/abrir?" + new URLSearchParams({url});
  a.onclick = async event => {
    event.preventDefault();
    const card = pai.closest("article");
    let aviso = card.querySelector("[role=status]");
    if (!aviso) {
      aviso = texto(card, "p", "");
      aviso.setAttribute("role", "status");
    }
    aviso.textContent = "Confirmando o endereço da loja…";
    try {
      const resposta = await fetch(a.href + "&confirmar=true", {cache:"no-store", redirect:"error"});
      if (!resposta.ok) throw new Error();
      const {destino} = await resposta.json();
      if (new URL(destino).protocol !== "https:") throw new Error();
      location.assign(destino);
    } catch {
      aviso.textContent = "Não foi possível confirmar este link. Tente outra oferta ou refaça a busca.";
    }
  };
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
    texto(card, "strong", "Loja: " + item.loja);
    const frete = item.frete == null ? "Frete a confirmar" : item.frete === 0 ? "Frete grátis" : "Frete de " + moeda.format(item.frete);
    texto(card, "p", moeda.format(item.preco) + " · " + frete);
    for (const [campo, titulo] of [["vantagens", "Por que vale a pena"], ["ressalvas", "Pontos de atenção"], ["avaliacoes", "O que dizem os compradores"]]) {
      if (!item[campo].length) {
        if (campo === "avaliacoes") texto(card, "p", "Avaliações deste modelo sem confirmação.");
        continue;
      }
      texto(card, "h3", titulo);
      const ul = texto(card, "ul", "");
      for (const fato of item[campo]) link(texto(ul, "li", fato.texto + " "), "Fonte", fato.url);
    }
    link(card, "Ver oferta · " + item.loja, item.url);
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
    if (!dados.destinos_verificados) throw new Error("O buscador precisa ser atualizado no servidor.");
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
