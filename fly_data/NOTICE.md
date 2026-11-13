# fly_circuit.npz 라이선스 안내

`fly_circuit.npz`는 FlyWire 공개 데이터(783 버전)로 만든 2차 저작물이며, 원본 라이선스인 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)을 따릅니다. **비상업적 용도로만** 쓸 수 있습니다.

- 원본: [FlyWire](https://flywire.ai). 시냅스 부호는 [Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model)(MIT)에서 가져왔습니다.
- 변경 사항: 약 14만 뉴런 중 감각 200·중간 1,600·하행 200개를 골라냈고, 시냅스 수를 log1p로 변환했습니다(`brain.py`의 `build_fly_circuit`).
- 인용: Dorkenwald et al. (2024) *Nature* 634, 124–138 · Schlegel et al. (2024) *Nature* 634, 139–152 · Shiu et al. (2024) *Nature* 634, 210–219 · Zheng et al. (2018) *Cell* 174, 730–743 · Dorkenwald et al. (2020) *bioRxiv* 2020.08.30.274225 · https://flywire.ai
- Drosophila_brain_model: Copyright (c) 2023 Philip Shiu and Nico Spiller, MIT License. 전문은 상위 폴더의 THIRD_PARTY_NOTICES.md에 있습니다.

원본 파일 `Connectivity_783.parquet`, `neuron_annotations.tsv`는 저장소에 넣지 않았습니다. 받는 방법은 상위 README를 보세요.
