# daims-assets

다임즈 이메일 · 서명용 이미지 호스팅 저장소입니다.
이미지를 여기에 올리고, 아래 URL 규칙으로 이메일/서명에 불러 씁니다.
(과거 AWS S3 방식을 대체 — 무료, URL 영구 고정)

## 폴더 구조

```
signature/      서명용 아이콘 · 로고 (항상 쓰는 것)
holiday/
  2026/         2026년 명절 이메일 이미지
email/          일반 이메일 본문 이미지
```

## 이미지 URL 규칙

repo에 파일을 올리면 두 가지 방식으로 링크가 생깁니다.

### 1) jsDelivr CDN (권장 — 빠르고 안정적)
```
https://cdn.jsdelivr.net/gh/happyrichkyj-cyber/daims@main/signature/logo.png
```

### 2) GitHub raw
```
https://raw.githubusercontent.com/happyrichkyj-cyber/daims/main/signature/logo.png
```

> `signature/logo.png` 부분만 실제 올린 파일 경로로 바꿔서 씁니다.

## 사용 팁
- 파일명은 **영문 소문자 + 하이픈**으로 (예: `daims-logo.png`, `seollal-2026.png`). 한글/공백 파일명은 URL에서 깨질 수 있음.
- 서명 아이콘은 **PNG(투명배경)** 또는 SVG 권장, 가로 200~600px 정도.
- 파일을 **덮어쓰면 URL은 그대로 유지**됨 → 이미지만 교체 가능.
