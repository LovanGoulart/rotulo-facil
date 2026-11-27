"use strict";
const $ = id => document.getElementById(id);
(function setupInstallBanner() {
  const standalone = window.matchMedia?.("(display-mode: standalone)") ?? {matches:false};
  const key = "rotulo.instalado";
  let installed = false;
  let dismissed = false;
  let promptEvent = null;
  let prompting = false;
  try { installed = localStorage.getItem(key) === "1"; } catch {}
  function remember(value) {
    installed = value;
    try { localStorage.setItem(key, value ? "1" : "0"); } catch {}
  }
  function render() {
    const inApp = standalone.matches || navigator.standalone === true;
    if (inApp) remember(true);
    $("installNote").hidden = inApp || dismissed;
    $("installText").hidden = !installed;
    $("installAction").hidden = installed;
    $("installAction").disabled = prompting;
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    promptEvent = event;
    remember(false);
    render();
  });
  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    remember(true);
    render();
  });
  window.addEventListener("storage", event => {
    if (event.key === key) { installed = event.newValue === "1"; render(); }
  });
  $("closeInstall").onclick = () => {
    dismissed = true;
    render();
    const target = $("home").hidden ? $("title") : $("home").querySelector("h1");
    target.focus({preventScroll:true});
  };
  standalone.addEventListener?.("change", render);
  function help() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    $("installSteps").textContent = ios
      ? "No Safari, toque em Compartilhar, escolha Adicionar à Tela de Início e confirme."
      : "Abra o menu do navegador e procure Instalar aplicativo ou Adicionar à tela inicial. Se a opção não aparecer, tente no Chrome ou Edge.";
    $("installHelp").showModal();
  }
  $("installAction").onclick = async () => {
    if (!promptEvent) { help(); return; }
    const event = promptEvent;
    promptEvent = null;
    prompting = true;
    render();
    try {
      await event.prompt();
      await event.userChoice;
    } catch { help(); }
    finally { prompting = false; render(); }
  };
  render();
  if (navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then(apps => {
      if (apps.some(app => app.platform === "webapp" &&
          app.url && new URL(app.url, location.href).href === location.origin + "/manifest.json")) {
        remember(true);
        render();
      }
    }).catch(() => {});
  }
  const bar = document.querySelector("header");
  const note = $("installNote");
  function measure() {
    const style = document.documentElement.style;
    style.setProperty("--topbar", bar.offsetHeight + "px");
    style.setProperty("--notice", (note.offsetHeight ? note.offsetHeight + 12 : 0) + "px");
  }
  measure();
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(note);
  } else {
    window.addEventListener("resize", measure);
  }
})();

const br = (value, digits = 2) => value.toLocaleString("pt-BR", {maximumFractionDigits:digits});
const money = value => value.toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
// ARSP, boletim jul–set/2026, p. 19. R$/MWh, residencial com tributos.
const rates = {PB:719,RR:762,SC:785,CE:803,PR:828,ES:833,AM:836,SP:841,SE:853,RN:854,PE:878,MA:899,DF:926,AL:931,RS:941,BA:946,AC:967,RO:976,AP:1010,MG:1014,PI:1028,GO:1028,MS:1077,MT:1083,RJ:1087,PA:1113,TO:1125};
const periods = ["Minuto","Hora","Dia","Mês (30 dias)","Ano"];
const nutrients = {kcal:"Energia",carboidratos:"Carboidratos",proteinas:"Proteínas",gorduras:"Gorduras"};
const mealKey = "rotulo.refeicao.v1";
let mode, item, photo, previewUrl, period = 3, request, revision = 0, library;
function el(tag, text, cls) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function button(text, fn) {
  const node = el("button", text);
  node.onclick = fn;
  return node;
}
function say(message) { $("status").textContent = message; }
function validFood(food) {
  return food && typeof food.nome === "string" && typeof food.porcao === "string" &&
    Object.keys(nutrients).every(k => Number.isFinite(food[k]) && food[k] >= 0);
}
function loadMeal() {
  try {
    const data = JSON.parse(localStorage.getItem(mealKey) || "[]");
    return Array.isArray(data) ? data.filter(validFood) : [];
  } catch { return []; }
}
let meal = loadMeal();
function saveMeal(next) {
  try { localStorage.setItem(mealKey, JSON.stringify(next)); }
  catch { say("O navegador não conseguiu salvar a refeição. Verifique o espaço disponível."); return false; }
  meal = next;
  drawMeal();
  return true;
}
function resetPhoto() {
  revision++;
  request?.abort();
  request = null;
  photo = item = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $("preview").removeAttribute("src");
  for (const id of ["confirmPhoto","resultBox","controls","add"]) $(id).hidden = true;
  $("analyze").disabled = false;
  say("");
}
function openMode(next) {
  resetPhoto();
  mode = next;
  $("work").hidden = !mode;
  $("home").hidden = Boolean(mode);
  $("region").hidden = mode !== "energia";
  $("title").textContent = mode === "energia" ? "Consumo de energia" : "Tabela nutricional";
  $("tip").textContent = mode === "energia" ? "Enquadre a potência em W ou o consumo em kWh/mês." : "Inclua a porção e as quatro linhas de energia, carboidratos, proteínas e gorduras.";
  drawMeal();
  (mode ? $("title") : $("home").querySelector("h1")).focus();
}
for (const node of document.querySelectorAll("[data-mode]")) node.onclick = () => openMode(node.dataset.mode);
$("back").onclick = () => openMode(null);
Object.keys(rates).sort().forEach(uf => $("uf").add(new Option(uf, uf)));
$("uf").value = "RS";
function tariff() {
  const value = $("rate").value.trim();
  if (!value) return rates[$("uf").value]/1000;
  return /^\d+(?:[.,]\d{1,8})?$/.test(value) && Number.isFinite(Number(value.replace(",", "."))) ? Number(value.replace(",", ".")) : NaN;
}
function updateRate() {
  const ok = Number.isFinite(tariff());
  $("rate").setAttribute("aria-invalid", String(!ok));
  $("reference").textContent = ok ? "Média residencial de " + $("uf").value + ": R$ " + br(rates[$("uf").value]/1000, 3) + "/kWh. ANEEL/ARSP, 12 meses até maio de 2026, com tributos." : "Informe um valor em R$/kWh, por exemplo 0,95.";
  if (mode === "energia" && item) drawEnergy();
}
$("uf").onchange = $("rate").oninput = updateRate;
updateRate();
$("snap").onclick = () => $("camera").click();
$("pick").onclick = () => $("gallery").click();
async function selectPhoto(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  resetPhoto();
  const version = revision;
  const url = URL.createObjectURL(file);
  try {
    if (file.size > 32*1024*1024) throw Error();
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1700/Math.max(img.width,img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(img.width*scale));
    canvas.height = Math.max(1,Math.round(img.height*scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/jpeg",.84));
    if (!blob) throw Error();
    if (revision !== version) return;
    photo = blob;
    previewUrl = URL.createObjectURL(blob);
    $("preview").src = previewUrl;
    $("confirmPhoto").hidden = false;
    $("analyze").focus();
  } catch { if (revision === version) say("Não foi possível abrir a foto. Escolha um JPEG ou PNG de até 32 MB."); }
  finally { URL.revokeObjectURL(url); }
}
$("gallery").onchange = $("camera").onchange = selectPhoto;
$("analyze").onclick = async () => {
  if (!photo || request) return;
  if (mode === "energia" && !Number.isFinite(tariff())) { $("rate").focus(); return; }
  const version = revision;
  request = new AbortController();
  const timer = setTimeout(() => request?.abort(), 75000);
  $("analyze").disabled = true;
  say("Lendo a etiqueta…");
  try {
    const response = await fetch("/api/"+mode,{method:"POST",body:photo,signal:request.signal,headers:{"Content-Type":"image/jpeg"}});
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Falha na leitura.");
    if (version !== revision) return;
    item = data;
    $("resultBox").hidden = false;
    if (mode === "energia") {
      period = 3;
      $("hours").value = item.horas_referencia ?? (item.continuo || item.mensal && !item.watts ? 24 : 1);
      $("controls").hidden = false;
      drawEnergy();
    } else {
      drawFood();
      $("add").hidden = false;
      $("add").disabled = false;
    }
    $("confirmPhoto").hidden = true;
    say("Leitura concluída. Confira os valores com a etiqueta.");
    $("result").focus();
  } catch (e) {
    if (version === revision) say(e instanceof TypeError || e instanceof SyntaxError || e.name === "AbortError" ? "Não foi possível concluir a leitura. Confira a conexão e tente novamente." : e.message);
  } finally {
    clearTimeout(timer);
    if (version === revision) { request = null; $("analyze").disabled = false; }
  }
};
periods.forEach((label,i) => $("periods").append(button(label, () => { period = i; drawEnergy(); })));
$("hours").oninput = drawEnergy;
function drawEnergy() {
  const hours = Number($("hours").value);
  const monthly = item.mensal != null && (item.horas_referencia != null || item.continuo || !item.watts);
  const base = item.horas_referencia ?? 24;
  const kw = monthly ? item.mensal/(30*base) : item.watts/1000;
  const kwh = kw * [1/60,1,hours,hours*30,hours*365][period];
  const basis = monthly ? "Consumo mensal distribuído por " + br(base) + " h/dia" + (item.horas_referencia ? " conforme a etiqueta." : " como hipótese de referência.") : "Estimativa pela potência nominal durante o uso.";
  $("hoursLabel").textContent = br(hours) + " h";
  $("basis").textContent = basis;
  Array.from($("periods").children).forEach((node,i) => node.setAttribute("aria-pressed",String(i === period)));
  const rate = tariff();
  $("result").replaceChildren(el("h2",item.nome),el("p", "Estimativa · " + periods[period] + (period < 2 ? " de uso" : period === 4 ? " (365 dias)" : "")),el("p",Number.isFinite(rate) ? money(kwh*rate) : "Confira a tarifa", "metric"),el("p",br(kwh,6)+" kWh"),el("p",[item.watts && br(item.watts)+" W",item.mensal && br(item.mensal)+" kWh/mês",item.classe && "Classe "+item.classe].filter(Boolean).join(" · ")),el("p",$("uf").value+" · "+(Number.isFinite(rate) ? "R$ "+br(rate,8)+"/kWh" : "Tarifa inválida")+" · "+br(hours)+" h/dia"),el("p",basis));
}
function macros(data) {
  const list = el("ul","");
  for (const [key,label] of Object.entries(nutrients)) list.append(el("li",label+": "+br(data[key])+(key === "kcal" ? " kcal" : " g")));
  return list;
}
function drawFood() {
  const result = $("result");
  result.replaceChildren(el("h2",item.nome),el("p","Porção do rótulo · "+item.porcao),macros(item),el("h3","Nível calórico · "+item.nivel),el("p","Escala ilustrativa por porção: baixo abaixo de 100 kcal, moderado de 100 a menos de 250 e alto a partir de 250."),el("h3","Quando consumir"),el("p",item.horario),el("h3","Porção sugerida"),el("p",item.quantidade),el("h3","Combina com"),el("p",item.combinacoes.join(" · ")));
}
$("add").onclick = () => {
  if (saveMeal([...meal,item])) { $("add").disabled = true; say("Uma porção adicionada. Para incluir outro alimento, tire uma nova foto."); $("meal").scrollIntoView(); }
};
function drawMeal() {
  $("mealBox").hidden = mode !== "nutricao" || !meal.length;
  if (!meal.length) return;
  const totals = Object.fromEntries(Object.keys(nutrients).map(k => [k,meal.reduce((sum,f) => sum+f[k],0)]));
  const list = el("ol","");
  const edit = $("editMeal");
  edit.replaceChildren(el("h3","Editar refeição"));
  meal.forEach((f,i) => {
    list.append(el("li",f.nome+" · "+f.porcao));
    edit.append(button("Remover "+f.nome+" ("+(i+1)+")", () => {
      if (saveMeal(meal.filter((_,j) => i !== j))) say("Alimento removido.");
    }));
  });
  edit.append(button("Limpar tabela", () => { $("clearDialog").returnValue = ""; $("clearDialog").showModal(); }));
  $("meal").replaceChildren(el("h2","Minha tabela nutricional da refeição"),list,el("h3","Total da refeição"),macros(totals));
}
$("clearDialog").onclose = () => { if ($("clearDialog").returnValue === "clear" && saveMeal([])) say("Refeição limpa."); };
window.addEventListener("storage", e => { if (e.key === mealKey || e.key === null) { meal = loadMeal(); drawMeal(); } });
function loadCanvas() {
  if (!library) library = new Promise((resolve,reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => { library = null; reject(Error("Conecte-se à internet para gerar a imagem.")); };
    document.head.append(script);
  });
  return library;
}
function shareText(text) { location.assign("https://wa.me/?text="+encodeURIComponent(text)); }
async function exportCard(id, share) {
  const card = $(id), text = card.innerText;
  if (share && (!navigator.canShare || !navigator.share)) { shareText(text); return; }
  try {
    const render = await loadCanvas();
    const canvas = await render(card,{scale:2,backgroundColor:"#ffffff",logging:false});
    const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/png"));
    if (!blob) throw Error("Falha ao criar a imagem.");
    const file = new File([blob], id === "meal" ? "minha-refeicao.png" : "resumo-rotulo.png",{type:"image/png"});
    if (share) {
      if (!navigator.canShare({files:[file]})) { shareText(text); return; }
      const send = async () => { try { await navigator.share({files:[file]}); } catch(e) { if (e.name !== "AbortError") shareText(text); } };
      if (navigator.userActivation?.isActive) await send();
      else {
        const dialog = document.createElement("dialog");
        dialog.setAttribute("aria-label","Compartilhar imagem");
        dialog.append(el("p","Imagem pronta. Escolha o aplicativo para enviar."),button("Escolher aplicativo",() => {dialog.close();send();}),button("Cancelar",() => dialog.close()));
        document.body.append(dialog);
        dialog.onclose = () => dialog.remove();
        dialog.showModal();
      }
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = file.name;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),30000);
    }
  } catch(e) { if (share) shareText(text); else say(e.message || "Não foi possível baixar o resumo."); }
}
for (const [id,actions] of [["result","resultActions"],["meal","mealActions"]]) {
  $(actions).append(button("📥 Baixar Resumo (Imagem)",() => exportCard(id,false)),button("📲 Enviar no WhatsApp",() => exportCard(id,true)));
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => say("A instalação offline está indisponível neste navegador."));

