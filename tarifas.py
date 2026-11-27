import asyncio
import json
import logging
import re
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

import httpx


URL_ANEEL = "https://dadosabertos.aneel.gov.br/api/3/action/datastore_search"
RECURSO_ANEEL = "fcf2906c-7c32-4b9b-a637-054e7a5234f4"
FILTROS = {
    "DscBaseTarifaria": "Tarifa de Aplicação",
    "DscSubGrupo": "B1",
    "DscModalidadeTarifaria": "Convencional",
    "DscClasse": "Residencial",
    "DscSubClasse": "Residencial",
    "DscDetalhe": "Não se aplica",
    "DscUnidadeTerciaria": "MWh",
    "NomPostoTarifario": "Não se aplica",
    "SigAgenteAcessante": "Não se aplica",
}
CAMPOS = (
    "SigAgente", "NumCNPJDistribuidora", "DatInicioVigencia", "DatFimVigencia",
    "VlrTUSD", "VlrTE", "DatGeracaoConjuntoDados",
)
HORARIO_BRASILIA = timezone(timedelta(hours=-3))
ARQUIVO_CONTINGENCIA = Path(__file__).with_name("tarifas-aneel.json")
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Tarifa:
    cnpj: str
    distribuidora: str
    inicio: date
    fim: date
    dados_gerados_em: date
    valor_kwh: float
    base_local: bool = False


class AneelIndisponivel(Exception):
    pass


async def buscar_tarifas(cliente: httpx.AsyncClient) -> list[Tarifa]:
    parametros = {
        "resource_id": RECURSO_ANEEL,
        "filters": json.dumps(FILTROS, ensure_ascii=False),
        "fields": ",".join(CAMPOS),
        "sort": "_id asc",
        "limit": "5000",
    }
    tarifas = []
    offset = 0
    while True:
        resposta = await cliente.get(
            URL_ANEEL, params={**parametros, "offset": str(offset)}, timeout=12.0,
        )
        resposta.raise_for_status()
        dados = resposta.json()
        if not dados["success"]:
            raise ValueError("Consulta recusada pela ANEEL")
        resultado = dados["result"]
        registros = resultado["records"]
        for linha in registros:
            agente, cnpj, inicio, fim, tusd, te, geracao = (
                linha[campo].strip() for campo in CAMPOS
            )
            if not agente or not re.fullmatch(r"[0-9]{14}", cnpj):
                continue
            componentes = [Decimal(valor.replace(",", ".")) for valor in (tusd, te)]
            if any(not valor.is_finite() or valor < 0 for valor in componentes):
                continue
            tarifas.append(Tarifa(
                cnpj, agente, date.fromisoformat(inicio), date.fromisoformat(fim),
                date.fromisoformat(geracao), float(sum(componentes) / 1000),
            ))
        offset += len(registros)
        if offset >= resultado["total"]:
            break
        if not registros:
            raise ValueError("Paginação incompleta na base da ANEEL")
    if not tarifas:
        raise ValueError("Base da ANEEL sem tarifas residenciais convencionais")
    return tarifas


def carregar_base_local() -> list[Tarifa]:
    try:
        dados = json.loads(ARQUIVO_CONTINGENCIA.read_text(encoding="utf-8"))
        return [
            Tarifa(
                tarifa["cnpj"], tarifa["distribuidora"], date.fromisoformat(tarifa["inicio"]),
                date.fromisoformat(tarifa["fim"]), date.fromisoformat(tarifa["dados_gerados_em"]),
                tarifa["valor_kwh"], base_local=True,
            )
            for tarifa in dados
        ]
    except (OSError, ValueError, KeyError, TypeError) as erro:
        logger.warning("Base local de tarifas indisponível: %s", type(erro).__name__)
        return []


class CatalogoTarifas:
    def __init__(self, cliente: httpx.AsyncClient):
        self.cliente = cliente
        self.tarifas = carregar_base_local()
        self.proxima_consulta = 0.0
        self.lock = asyncio.Lock()

    async def vigentes(self) -> dict[str, Tarifa]:
        async with self.lock:
            if time.monotonic() >= self.proxima_consulta:
                try:
                    self.tarifas = await asyncio.wait_for(buscar_tarifas(self.cliente), timeout=25)
                except (httpx.HTTPError, TimeoutError, asyncio.TimeoutError, ValueError, KeyError,
                        TypeError, AttributeError, InvalidOperation) as erro:
                    logger.warning("Falha ao atualizar tarifas da ANEEL: %s", erro)
                    self.proxima_consulta = time.monotonic() + 60
                else:
                    self.proxima_consulta = time.monotonic() + 3600
        hoje = datetime.now(HORARIO_BRASILIA).date()
        vigentes = {}
        for tarifa in self.tarifas:
            if tarifa.inicio <= hoje <= tarifa.fim:
                anterior = vigentes.get(tarifa.cnpj)
                if anterior is None or (tarifa.inicio, tarifa.fim) >= (anterior.inicio, anterior.fim):
                    vigentes[tarifa.cnpj] = tarifa
        if not vigentes:
            raise AneelIndisponivel
        return vigentes



async def atualizar_base_local() -> None:
    async with httpx.AsyncClient() as cliente:
        tarifas = await asyncio.wait_for(buscar_tarifas(cliente), timeout=35)
    hoje = datetime.now(HORARIO_BRASILIA).date()
    dados = [asdict(tarifa) for tarifa in tarifas if tarifa.fim >= hoje]
    if not dados:
        raise ValueError("A ANEEL não retornou tarifas com vigência atual ou futura.")
    temporario = ARQUIVO_CONTINGENCIA.with_suffix(".tmp")
    temporario.write_text(
        json.dumps(dados, default=str, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    temporario.replace(ARQUIVO_CONTINGENCIA)
    print(f"{len(dados)} registros salvos em {ARQUIVO_CONTINGENCIA.name}.")


if __name__ == "__main__":
    asyncio.run(atualizar_base_local())
