"""merge heads

Revision ID: 4c5ad3b5836c
Revises: d2e3f4a5b6c7, g1h2i3j4k5l6
Create Date: 2026-04-14 21:19:38.496857

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c5ad3b5836c'
down_revision: Union[str, Sequence[str], None] = ('d2e3f4a5b6c7', 'g1h2i3j4k5l6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
