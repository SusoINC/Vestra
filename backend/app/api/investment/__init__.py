from flask import Blueprint

bp = Blueprint("investment", __name__)

from . import routes  # noqa: E402, F401
