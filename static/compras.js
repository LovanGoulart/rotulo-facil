const produto = document.getElementById("produto");
produto.addEventListener("input", () => produto.setCustomValidity(""));
document.querySelector("form").addEventListener("submit", event => {
  event.preventDefault();
  const termo = produto.value.trim().replace(/\s+/g, " ");
  if (!termo || /^\.{1,2}$/.test(termo)) {
    produto.setCustomValidity("Digite o nome do produto.");
    produto.reportValidity();
    return;
  }
  const busca = encodeURIComponent(termo);
  window.location.assign("https://www.magazinevoce.com.br/magazineinformaticalg/busca/" + busca + "/");
});
