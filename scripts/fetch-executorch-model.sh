#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="${ROOT_DIR}/models/executorch/llama-3.2-1b-spinquant-int4"
REVISION="911221e0f49d3354cbd4697a9c09feee25cadec7"
REPOSITORY="executorch-community/Llama-3.2-1B-Instruct-SpinQuant_INT4_EO8-ET"
MODEL_FILE="Llama-3.2-1B-Instruct-SpinQuant_INT4_EO8.pte"
TOKENIZER_FILE="tokenizer.model"
MODEL_SHA256="8715cdba9e91f6bede00cc5f2d6b12397b95225da5630c4972a8da03001cda3b"
TOKENIZER_SHA256="82e9d31979e92ab929cd544440f129d9ecd797b69e327f80f17e1c50d5551b55"

mkdir -p "${MODEL_DIR}"

download_and_verify() {
  local filename="$1"
  local expected_sha256="$2"
  local destination="${MODEL_DIR}/${filename}"
  local url="https://huggingface.co/${REPOSITORY}/resolve/${REVISION}/${filename}?download=true"

  if [[ ! -f "${destination}" ]]; then
    curl --fail --location --continue-at - --output "${destination}" "${url}"
  fi

  local actual_sha256
  actual_sha256="$(shasum -a 256 "${destination}" | awk '{print $1}')"
  if [[ "${actual_sha256}" != "${expected_sha256}" ]]; then
    echo "Checksum mismatch for ${filename}." >&2
    echo "Expected: ${expected_sha256}" >&2
    echo "Actual:   ${actual_sha256}" >&2
    exit 1
  fi
}

download_and_verify "${MODEL_FILE}" "${MODEL_SHA256}"
download_and_verify "${TOKENIZER_FILE}" "${TOKENIZER_SHA256}"

echo "Verified ExecuTorch model assets in ${MODEL_DIR}."
