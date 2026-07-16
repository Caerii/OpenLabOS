"""Optional dev smoke test: uv run --extra dev python scripts/smoke_api.py"""

from __future__ import annotations

from fastapi.testclient import TestClient

from openlabos_inference.main import app


def main() -> None:
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "ok"
        assert body["protocol_count"] >= 1
        assert "kitchen-tea-v1" in body["protocol_ids"]
        assert body["sqlite_path"]
        assert body["sqlite_path"].endswith(".sqlite")

        plist = client.get("/protocols")
        assert plist.status_code == 200
        assert any(p["protocol_id"] == "kitchen-tea-v1" for p in plist.json())

        pd = client.get("/protocols/kitchen-tea-v1")
        assert pd.status_code == 200, pd.text
        proto = pd.json()
        assert proto["protocol_id"] == "kitchen-tea-v1"
        assert proto["name"]
        assert len(proto["steps"]) == 5

        r3 = client.post("/sessions", json={"protocol_id": "kitchen-tea-v1"})
        assert r3.status_code == 201, r3.text
        data = r3.json()
        assert data["protocol_version"] == "1"
        assert data["name"]
        assert len(data["steps"]) == 5
        assert data["steps"][0]["status"] == "active"
        assert data["steps"][0]["order"] == 0
        assert "Place mug" in data["steps"][0]["title"]
        assert data["steps"][1]["status"] == "pending"
        assert data["steps"][1]["order"] == 1
        for i in range(2, 5):
            assert data["steps"][i]["status"] == "pending"
        assert "step_order" not in data["steps"][0]

        bad_proto = client.post("/sessions", json={"protocol_id": "no-such-protocol"})
        assert bad_proto.status_code == 422, bad_proto.text
        assert "Unknown protocol_id" in bad_proto.json()["detail"]

        sid = data["session_id"]
        r4 = client.get(f"/sessions/{sid}")
        assert r4.status_code == 200
        again = r4.json()
        assert again["protocol_id"] == "kitchen-tea-v1"
        assert again["protocol_version"] == "1"
        assert again["name"]
        assert len(again["steps"]) == 5
        assert again["steps"][0]["title"] == data["steps"][0]["title"]

        missing = client.get("/sessions/00000000-0000-0000-0000-000000000000")
        assert missing.status_code == 404

        del_r = client.delete(f"/sessions/{sid}")
        assert del_r.status_code == 204
        assert client.get(f"/sessions/{sid}").status_code == 404

    print("smoke_api: OK")


if __name__ == "__main__":
    main()
