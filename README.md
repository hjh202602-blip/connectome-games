# 진짜 뇌와 대결 (Connectome Games)

실제 동물 커넥톰을 쓴 곤충 뇌, 또는 스스로 연습한 신경망(학습 AI)과 패들볼을 칩니다. 전체화면으로 실행됩니다.

메뉴에는 탭이 세 개 있습니다(TAB 키나 클릭으로 바꿉니다).
- **사람 vs 곤충 뇌**: 꼬마선충이나 초파리를 고릅니다.
- **사람 vs 학습 AI**: v1, v2 중에서 고릅니다.
- **대결**: 파랑과 주황 자리에 꼬마선충·초파리·학습 AI v1·v2 중 하나씩 골라 둘의 경기를 구경합니다.

규칙은 이렇습니다.
- 판을 움직이면서 치면 공에 회전이 걸려 휩니다. 회전 방향으로 치면 더 세지고, 반대로 치면 약해지거나 뒤집힙니다.
- 회전이 셀수록 공이 빨라집니다(회전 최대일 때 2배).
- 사람 판과 학습 AI 판에는 똑같은 관성이 있습니다(같은 가속, 마찰, 최고 속도). 곤충 뇌는 판을 바로 움직입니다.

| 뇌 | 데이터 | 규모 |
|---|---|---|
| 꼬마선충 | *C. elegans* 전체 (Cook et al. 2019, `cect` 패키지) | 뉴런 302개, 화학 시냅스 3,004개, 갭정션 854개 |
| 초파리 | FlyWire 성체 뇌 (Dorkenwald et al. 2024)에서 잘라낸 회로. 흥분/억제 부호는 Shiu et al. 2024 | 뉴런 2,000개, 연결 약 16만 개 |

```bash
pip install -r requirements.txt
python main.py
```

## 학습 AI (스스로 연습하는 신경망)
꼬마선충·초파리 뇌는 공이 오는 곳으로 가는 것만 배워서, 휘는 공을 잘 못 읽고 회전을 걸 줄도 모릅니다.
학습 AI는 커넥톰이 아닌 일반 신경망(입력 10 → 32 → 32 → 1)이고, 혼자 수만 판을 치며 배웁니다. GPU 없이 numpy로 CPU에서 학습합니다.

```bash
python train_ai.py v1            # v1: 150세대 학습 (저장된 AI가 있으면 이어서)
python train_ai.py v1 300        # 세대 수 지정
python train_ai.py v1 300 --new  # 처음부터 다시
python train_ai.py v2            # v2: 저장된 v2에서 이어서 (없으면 v1에서 출발)
python train_ai.py v2 60 --new   # v2를 v1에서 새로 출발
python eval_ai.py                # 실력 재기
```
- 공의 회전, 상대 판 위치, 자기 판 속도와 지난 움직임까지 보고 판을 밉니다. 판은 사람과 똑같은 관성으로 움직입니다.
- 학습 방법은 진화 전략(evolution strategies)입니다. 세대마다 조금씩 다른 복사본들이 각 8판(20초)씩 동시에 치고, 점수를 많이 낸 복사본 쪽으로 신경망을 옮깁니다.
- 득점 외에 작은 보너스가 있습니다.
  - 받아치기
  - 회전 걸기
  - **상대 판에서 먼 쪽으로 치기**: 친 공이 회전으로 휘는 궤적까지 계산해서 상대 판이 있는 곳에서 얼마나 먼 곳에 떨어질지 봅니다. 코트 40% 이상 떨어지면 보너스를 다 받습니다.
- **v1**: 복사본 64개. 상대는 공의 휘는 궤적을 정확히 계산하는 '예측 상대' 4판, 회전을 무시하는 '직선 상대'(곤충 뇌와 비슷) 2판, 자기 자신 2판입니다. 모두 500세대(관성 없이 250세대 → 관성 넣고 150세대 → 먼 쪽 보상 넣고 100세대).
- **v2**: v1(500세대)에서 출발해 진짜 꼬마선충·초파리 뇌와 겨루며 60세대를 더 배웁니다. 복사본 32개, 상대는 꼬마선충 2판, 초파리 2판, 예측 상대 2판, 자기 자신 2판입니다. 초파리 뇌는 계산이 느려서 학습 중에는 2프레임마다 판단합니다. 60세대에 약 41분 걸렸습니다.
- 10세대마다 `models/ai_paddle.npz`(v2는 `ai_paddle_v2.npz`)에 저장하고, 끝나면 웹용 `web/ai.js`도 새로 만듭니다.
- `python eval_ai.py` 결과(32판 × 60초, 얻은 점수 : 잃은 점수):
  | 상대 | v1 | v2 |
  |---|---|---|
  | 꼬마선충 | 26 : 25 (51%) | 15 : 4 (79%) |
  | 초파리 | 5 : 22 (19%) | 12 : 3 (80%) |
  | 예측 상대 (궤적을 정확히 계산) | 0 : 16 | 0 : 24 |
  | v2 vs v1 | | 48 : 31 (v2 득점 61%) |

  관성이 생기면서 점수가 잘 안 나는 긴 랠리가 많아졌습니다. 곤충 뇌와 직접 겨뤄 본 v2가 곤충 뇌와 v1을 모두 이깁니다.
- 물리 규칙은 `paddle.py` 하나에 있어서 학습과 게임이 같은 규칙을 씁니다(웹 버전 `web/game.js`도 같은 규칙).

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
- 학습되는 것은 마지막 선형 출력층 하나뿐입니다(리저버 컴퓨팅). 선생님(공이 도착할 위치를 계산하는 코드)의 답을 흉내 냅니다.
- 초파리 회로는 크고 층이 깊어서 신호가 출력까지 거의 도달하지 못했습니다. 그래서 뉴런마다 받는 입력의 총세기를 같게 맞췄습니다(이득 8).
- 다시 학습하려면 `python train.py`, `python train.py fly`, `python train.py worm` 처럼 실행하세요.

## 실력
| | 꼬마선충 | 초파리 |
|---|---|---|
| 패들볼 (공 받아냄) | 89% | 92% |

## 데이터 출처와 라이선스
게임 코드는 직접 작성한 것입니다(코드 라이선스는 아직 정하지 않음). 저장소에 들어 있는 뇌 데이터에는 원본의 라이선스가 따로 적용됩니다. 원본 라이선스 전문과 저작권 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.

### 초파리: FlyWire, CC BY-NC 4.0
`fly_data/fly_circuit.npz`와 `web/brains.js`의 초파리 부분은 FlyWire 공개 데이터(783 버전)에서 만든 2차 저작물입니다. 원본 라이선스인 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)을 그대로 따릅니다. **비상업적 용도로만** 쓸 수 있습니다.
- 변경 사항: 원본 약 14만 뉴런에서 감각 200·중간 1,600·하행 200개를 골라냈습니다. 시냅스 수를 log1p로 변환하고, 뉴런마다 받는 입력의 총세기를 같게 정규화(이득 8)했습니다.
- 원본 데이터: [FlyWire](https://flywire.ai), [flywire_annotations](https://github.com/flyconnectome/flywire_annotations). 시냅스 부호(흥분/억제)는 [Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model)(MIT)에서 가져왔습니다.
- 인용
  - Dorkenwald, S. et al. (2024). Neuronal wiring diagram of an adult brain. *Nature* 634, 124–138.
  - Schlegel, P. et al. (2024). Whole-brain annotation and multi-connectome cell typing of *Drosophila*. *Nature* 634, 139–152.
  - Shiu, P. K. et al. (2024). A *Drosophila* computational brain model reveals sensorimotor processing. *Nature* 634, 210–219.
  - Zheng, Z. et al. (2018). A complete electron microscopy volume of the brain of adult *Drosophila melanogaster*. *Cell* 174, 730–743.
  - Dorkenwald, S. et al. (2020). FlyWire: Online community for whole-brain connectomics. *bioRxiv* 2020.08.30.274225. 웹사이트: https://flywire.ai

### 꼬마선충: Cook et al. 2019
`web/brains.js`의 꼬마선충 부분은 Cook et al. (2019)의 연결 데이터로 만들었습니다. 데이터는 OpenWorm [ConnectomeToolbox (`cect`)](https://github.com/openworm/ConnectomeToolbox)(MIT)를 통해 받았습니다. 시냅스 수를 log1p로 변환하고 GABA 뉴런을 억제성으로 처리한 뒤 크기를 조정했습니다.
- Cook, S. J. et al. (2019). Whole-animal connectomes of both *Caenorhabditis elegans* sexes. *Nature* 571, 63–71.
