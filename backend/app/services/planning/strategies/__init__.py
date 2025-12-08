from .balanced import BalancedStrategy
from .dense import DenseStrategy
from .sla import SLAStrategy
from ....models.planning_session import PlanningStrategy as PSEnum
from ..context import PlanningContext

def get_strategy(strategy_type: PSEnum, context: PlanningContext):
    if strategy_type == PSEnum.DENSE:
        return DenseStrategy(context)
    elif strategy_type == PSEnum.PRIORITY_FIRST or strategy_type == PSEnum.SLA: # Support aliases if needed
        return SLAStrategy(context)
    elif strategy_type == PSEnum.FILL_FIRST: # Map FILL_FIRST to Dense logic for now or implement separate
        return DenseStrategy(context)
    else: # Balanced or Optimal
        return BalancedStrategy(context)
