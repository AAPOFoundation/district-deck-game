// Original table: mvp/tests/landing-shot-hunt.mjs, r16 critic poses.
// M30 re-aims the two street beats into existing blocks; other beats and hunt history are retained.

export const LANDING_CAMERA_BEAT_IDS = [
  "beat-01-entry",
  "beat-02-terrace-hero",
  "need-01",
  "need-03",
  "beat-05-retail",
  "need-02",
  "need-04"
];

export const LANDING_CAMERA_BEATS = [
  {
    "id": "beat-01-entry",
    "subject": "southbound street off the reserve",
    "distance": 22.1,
    "azimuthDeg": 12,
    "height": 7.55,
    "eye": [
      115.4,
      7.55,
      181.6
    ],
    "look": [
      106.8,
      5.35,
      163.2
    ],
    "pitchDeg": 6.76,
    "score": 66.048,
    "from": "r22-wrap-handoff"
  },
  {
    "id": "beat-02-terrace-hero",
    "subject": "terrace row + verandah",
    "distance": 22.63,
    "azimuthDeg": -45,
    "height": 10.6,
    "eye": [
      136,
      10.6,
      80
    ],
    "look": [
      152,
      5.8,
      64
    ],
    "pitchDeg": 11.98,
    "score": 65.332
  },
  {
    "id": "need-01",
    "subject": "junction and western street frontage",
    "distance": 32.2,
    "azimuthDeg": 36.2,
    "height": 6,
    "eye": [
      142,
      6,
      104
    ],
    "look": [
      123,
      2.4,
      78
    ],
    "pitchDeg": 6.38,
    "from": "m30-western-street-reframe",
    "portrait": {
      "eye": [
        136,
        6,
        104
      ],
      "look": [
        136,
        2.4,
        84
      ]
    }
  },
  {
    "id": "need-03",
    "subject": "tram corridor with western block enclosure",
    "distance": 32.2,
    "azimuthDeg": 36.2,
    "height": 7,
    "eye": [
      140,
      7,
      104
    ],
    "look": [
      121,
      3.2,
      78
    ],
    "pitchDeg": 6.73,
    "from": "m30-western-street-reframe",
    "portrait": {
      "eye": [
        132,
        7,
        104
      ],
      "look": [
        133,
        3.2,
        78
      ]
    }
  },
  {
    "id": "beat-05-retail",
    "subject": "shopfronts + balcony + tables",
    "distance": 27.2,
    "azimuthDeg": -42,
    "height": 11.4,
    "eye": [
      133,
      11.4,
      149
    ],
    "look": [
      152,
      4.4,
      128
    ],
    "pitchDeg": 14.4,
    "score": 70.592,
    "from": "r22-balcony-sky"
  },
  {
    "id": "need-02",
    "subject": "reserve with context",
    "distance": 38.2,
    "azimuthDeg": 108.4,
    "height": 12,
    "eye": [
      136,
      12,
      156
    ],
    "look": [
      100,
      4,
      168
    ],
    "pitchDeg": 11.9,
    "score": 42.784
  },
  {
    "id": "need-04",
    "subject": "civic rotunda",
    "distance": 23.41,
    "azimuthDeg": 20,
    "height": 6.5,
    "eye": [
      112,
      6.5,
      190
    ],
    "look": [
      104,
      4.5,
      168
    ],
    "pitchDeg": 4.88,
    "score": 72.4,
    "from": "r19-near-south"
  }
];

export const LANDING_CAMERA_HUNT_META = {
  "generatedAt": "2026-08-17T10:10:00.000Z",
  "order": "r22-wrap-handoff",
  "passCount": 5,
  "candidateCount": 16,
  "residualFails": 0,
  "recast": {
    "need-01": "r20-junc-north",
    "need-04": "r19-near-south",
    "beat-01-entry": "r22-wrap-handoff",
    "beat-05-retail": "r22-balcony-sky"
  }
};
