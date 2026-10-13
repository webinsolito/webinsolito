from __future__ import annotations

import sys
import types

from app.config import Settings
from app.storage import S3PrivateStorage


class FakeConfig:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class FakeS3Client:
    def __init__(self):
        self.put_calls: list[dict] = []

    def put_object(self, **kwargs):
        self.put_calls.append(kwargs)


def install_fake_boto(monkeypatch):
    captured: dict[str, object] = {}
    fake_client = FakeS3Client()

    def client(service_name: str, **kwargs):
        captured["service_name"] = service_name
        captured["kwargs"] = kwargs
        return fake_client

    boto3_module = types.ModuleType("boto3")
    boto3_module.client = client
    botocore_module = types.ModuleType("botocore")
    config_module = types.ModuleType("botocore.config")
    config_module.Config = FakeConfig

    monkeypatch.setitem(sys.modules, "boto3", boto3_module)
    monkeypatch.setitem(sys.modules, "botocore", botocore_module)
    monkeypatch.setitem(sys.modules, "botocore.config", config_module)
    return captured, fake_client


def test_s3_path_style_is_explicit_for_compatible_provider(monkeypatch):
    captured, _ = install_fake_boto(monkeypatch)
    settings = Settings(
        storage_backend="s3",
        s3_bucket="risolvi-private",
        s3_region="eu-central-1",
        s3_endpoint_url="https://project.storage.example/storage/v1/s3",
        s3_force_path_style=True,
    )

    S3PrivateStorage(settings)

    assert captured["service_name"] == "s3"
    kwargs = captured["kwargs"]
    assert kwargs["region_name"] == "eu-central-1"
    assert kwargs["endpoint_url"] == "https://project.storage.example/storage/v1/s3"
    assert kwargs["config"].kwargs == {"s3": {"addressing_style": "path"}}


def test_s3_upload_does_not_send_provider_incompatible_sse_header(monkeypatch):
    _, fake_client = install_fake_boto(monkeypatch)
    settings = Settings(
        storage_backend="s3",
        s3_bucket="risolvi-private",
        s3_region="eu-central-1",
        s3_endpoint_url="https://project.storage.example/storage/v1/s3",
        s3_force_path_style=True,
    )
    storage = S3PrivateStorage(settings)

    storage.put("cases/case-1/document-1", b"synthetic", "text/plain")

    assert fake_client.put_calls == [
        {
            "Bucket": "risolvi-private",
            "Key": "cases/case-1/document-1",
            "Body": b"synthetic",
            "ContentType": "text/plain",
        }
    ]
    assert "ServerSideEncryption" not in fake_client.put_calls[0]
