from .paper_collector import PaperCollector
from .implementer import Implementer
from .research_director import ResearchDirector

AGENT_CLASSES: dict[str, type] = {
    "paper-collector": PaperCollector,
    "implementer": Implementer,
    "research-director": ResearchDirector,
}
