# 情緒星空

讓夜空映照你的心情。純前端網頁，不需要後端或建置工具。

## 兩個功能

- **情緒星空**：用鏡頭辨識表情（[@vladmandic/face-api](https://github.com/vladmandic/face-api)），天空隨心情變化：
  - 正常：擬真星空與薄雲
  - 開心：主星明亮、流星劃過
  - 傷心：烏雲與雨
  - 憤怒：雷暴

  影像只在本機分析，畫面上不會出現真人影像。
- **呼吸星空瓶**：跟著節奏呼吸（平靜 4-6、方塊 4-4-4-4、放鬆 4-7-8），星空瓶像呼吸燈一樣明暗，完成 10 次呼吸點亮右上角的星星。不需要鏡頭。

## 執行

鏡頭只能在 `https` 或 `localhost` 下使用：

```
npx serve .
# 或
python -m http.server 8000
```

開啟 `http://localhost:8000`。也可以直接部署到 GitHub Pages。

開發過程記錄在 [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)。
