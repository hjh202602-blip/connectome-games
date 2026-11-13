# 진짜 뇌와 대결 (Connectome Games)

실제 동물 커넥톰을 쓴 AI와 퐁, 틱택토, 사목을 둡니다. 전체화면으로 실행되며, 메뉴에서 TAB 키나 클릭으로 뇌를 고를 수 있습니다.

| 뇌 | 데이터 | 규모 |
|---|---|---|
| 꼬마선충 | *C. elegans* 전체 (Cook et al. 2019, `cect` 패키지) | 뉴런 302개, 화학 시냅스 3,004개, 갭정션 854개 |
| 초파리 | FlyWire 성체 뇌 (Dorkenwald et al. 2024)에서 잘라낸 회로. 흥분/억제 부호는 Shiu et al. 2024 | 뉴런 2,000개, 연결 약 16만 개 |

```bash
pip install -r requirements.txt
python main.py
```

## 웹 버전
`web/index.html`을 브라우저로 열면 설치 없이 바로 됩니다. 기능은 pygame 버전과 같습니다.
- 뇌 계산은 JavaScript(`web/brain.js`)로 다시 짰고, Python과 결과가 같습니다(최대 오차 0.00001).
- 배선과 학습된 출력층은 `web/brains.js`(2MB)에 들어 있습니다. 다시 학습한 뒤에는 `python export_web.py`로 새로 만드세요.
- 브라우저에서는 ESC가 전체화면 해제에 쓰이므로, 메뉴로 돌아가거나 그만 볼 때는 **Q**를 누르거나 화면의 버튼을 쓰세요.

## 초파리 데이터
잘라낸 회로(`fly_data/fly_circuit.npz`)와 학습된 모델(`models/`)이 저장소에 들어 있어서 바로 실행됩니다. 회로를 새로 잘라내려면 아래 원본 파일(약 130MB, 저장소에는 없음)을 `fly_data/`에 받은 뒤 `fly_circuit.npz`를 지우세요.
- `Connectivity_783.parquet`: github.com/philshiu/Drosophila_brain_model
- `neuron_annotations.tsv`: github.com/flyconnectome/flywire_annotations 의 `supplemental_files/Supplemental_file1_neuron_annotations.tsv`

초파리 회로는 이렇게 고릅니다.
- 시각을 제외한 감각 뉴런 200개 (중앙 뇌로 가는 출력이 가장 많은 것)
- 하행 뉴런 200개 (뇌에서 몸으로 명령을 보냄)
- 중간 뉴런 1,600개 (절반은 선택된 감각 뉴런에서 입력을 가장 많이 받는 것, 절반은 선택된 하행 뉴런에 가장 많이 출력하는 것)

## 작동 방식
- 배선은 실제 데이터를 그대로 쓰고, 학습 중에도 바꾸지 않습니다.
- 게임 상태는 감각 뉴런에만 넣고, 수는 출력 뉴런(꼬마선충: 중간·운동 뉴런, 초파리: 하행 뉴런)에서만 읽습니다.
- 학습되는 것은 마지막 선형 출력층 하나뿐입니다(리저버 컴퓨팅). 선생님(퐁: 공 궤적 계산, 틱택토: 완전 탐색, 사목: 3수 탐색)의 답을 흉내 냅니다.
- 초파리 회로는 크고 층이 깊어서 신호가 출력까지 거의 도달하지 못했습니다. 그래서 뉴런마다 받는 입력의 총세기를 같게 맞췄습니다(이득 8).
- 다시 학습하려면 `python train.py`, `python train.py fly`, `python train.py worm pong` 처럼 실행하세요.

## 실력 (무작위 상대 200판, 선공/후공 반반)
| | 꼬마선충 | 초파리 |
|---|---|---|
| 퐁 (공 받아냄) | 89% | 92% |
| 틱택토 | 175승 10무 15패 | 175승 11무 14패 |
| 사목 | 138승 62패 | 137승 63패 |
| 사목: 선생님 최선수 일치율 | 37% | 48% |

## 데이터 출처와 라이선스
게임 코드는 직접 작성한 것입니다(코드 라이선스는 아직 정하지 않음). 저장소에 들어 있는 뇌 데이터에는 원본의 라이선스가 따로 적용됩니다.

### 초파리: FlyWire, CC BY-NC 4.0
`fly_data/fly_circuit.npz`와 `web/brains.js`의 초파리 부분은 FlyWire 공개 데이터(783 버전)에서 만든 2차 저작물입니다. 원본 라이선스인 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)을 그대로 따릅니다. **비상업적 용도로만** 쓸 수 있습니다.
- 변경 사항: 원본 약 14만 뉴런에서 감각 200·중간 1,600·하행 200개를 골라냈습니다. 시냅스 수를 log1p로 변환하고, 뉴런마다 받는 입력의 총세기를 같게 정규화(이득 8)했습니다.
- 원본 데이터: [FlyWire](https://flywire.ai), [flywire_annotations](https://github.com/flyconnectome/flywire_annotations). 시냅스 부호(흥분/억제)는 [Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model)(MIT)에서 가져왔습니다.
- 인용
  - Dorkenwald, S. et al. (2024). Neuronal wiring diagram of an adult brain. *Nature* 634, 124–138.
  - Schlegel, P. et al. (2024). Whole-brain annotation and multi-connectome cell typing of *Drosophila*. *Nature* 634, 139–152.
  - Shiu, P. K. et al. (2024). A *Drosophila* computational brain model reveals sensorimotor processing. *Nature* 634, 210–219.
  - Zheng, Z. et al. (2018). A complete electron microscopy volume of the brain of adult *Drosophila melanogaster*. *Cell* 174, 730–743.

### 꼬마선충: Cook et al. 2019
`web/brains.js`의 꼬마선충 부분은 Cook et al. (2019)의 연결 데이터로 만들었습니다. 데이터는 OpenWorm [ConnectomeToolbox (`cect`)](https://github.com/openworm/ConnectomeToolbox)(MIT)를 통해 받았습니다. 시냅스 수를 log1p로 변환하고 GABA 뉴런을 억제성으로 처리한 뒤 크기를 조정했습니다.
- Cook, S. J. et al. (2019). Whole-animal connectomes of both *Caenorhabditis elegans* sexes. *Nature* 571, 63–71.
