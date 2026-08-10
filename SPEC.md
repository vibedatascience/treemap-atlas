# Dataset contract

Every dataset is one JSON file in datasets/ plus an entry in datasets/index.json.

```json
{
  "title": "World population",
  "unit": "people",
  "source": "World Bank 2024",
  "date": "2024",
  "items": [
    {"name": "India", "value": 1450935791, "parent": "South Asia", "color_key": "South Asia"}
  ]
}
```

Rules:
- value: one non-negative number per item. Values must be summable (areas add).
- parent: optional. Present = grouped layout with zoom-into-group.
- color_key: optional. Present = category color mode.
- Keep files under 5MB.

Registry entry:
```json
{"id": "population", "title": "World population", "unit": "people", "source": "World Bank 2024"}
```
