def ok(data: dict, message: str = "success"):
    return {"code": 200, "message": message, "data": data}


def fail(message: str, code: int = 500, data: dict = None):
    return {"code": code, "message": message, "data": data or {}}


