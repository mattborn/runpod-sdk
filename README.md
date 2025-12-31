# runpod-sdk

## Text

```bash
node text "What is the capital of Germany?" qwen/qwen3-32b-awq
```

## Image

```bash
node t2i "A serene mountain landscape at sunset" pruna/p-image-t2i
```

Local edit example:

```bash
node i2i "./room.png,./chair.png" "Add warm lighting" pruna/p-image-edit
```

## Serverless

```bash
node curl "./room.png" "A futuristic city at night"
```
