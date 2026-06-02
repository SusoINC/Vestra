from flask import Blueprint

bp = Blueprint("project", __name__)

from . import routes  # noqa: E402, F401
