# CV结果对比工具

一个用于对比CV任务中不同模型输出结果与GT（真实标签/真值）的网页应用。

## 功能特点

- **文件夹选择功能**：网页端浏览服务器文件夹，选择GT和模型输出文件夹
- **图像对比功能**：按"GT + 模型1输出 + 模型2输出 + ..."布局展示同名图像
- **同步放大查看**：鼠标选中任意图像区域，所有对比图像相同位置同步放大
- **拖拽与缩放**：支持拖拽调整放大区域、滚轮调节放大倍数
- **响应式设计**：界面自适应网页大小，支持图像切换

## 技术栈

- **后端**：Python Flask
- **前端**：HTML + CSS + JavaScript
- **图像处理**：Canvas API

## 项目结构

```
picture_comparsion/
├── backend/
│   ├── app.py          # 后端主应用
│   ├── requirements.txt # 依赖包
│   └── .env           # 环境配置
├── frontend/
│   ├── index.html     # 前端页面
│   ├── styles.css     # 样式文件
│   └── script.js      # 前端逻辑
└── README.md          # 说明文档
```

## 部署步骤

### 1. 环境准备

- Python 3.7+
- pip

### 2. 安装依赖

```bash
cd backend
pip install -r requirements.txt
pip install flask-cors
```

### 3. 配置根目录

编辑 `backend/.env` 文件，设置图像根目录：

```
ROOT_DIR=/path/to/your/images
```

### 4. 启动后端服务

```bash
cd backend
python app.py
```

服务将在 `http://0.0.0.0:5000` 启动

### 5. 访问前端页面

使用浏览器打开 `frontend/index.html` 文件即可访问应用。

## 使用说明

### 选择文件夹

1. 在网页端浏览服务器文件夹
2. 选择一个文件夹作为GT文件夹
3. 选择一个或多个文件夹作为模型输出文件夹
4. 点击"确认对比"按钮

### 图像对比

1. 在图像选择下拉框中选择要对比的图像
2. 鼠标移动到任意图像上，自动显示缩放框
3. 使用鼠标滚轮调节放大倍数
4. 拖动鼠标可以调整放大区域
5. 放大后的细节会在右上角的悬浮窗口中显示

## API接口

### 获取文件夹列表
```
GET /api/folders?path={path}
```

### 获取对比图像列表
```
POST /api/images
{
  "gt_folder": "gt",
  "model_folders": ["model1", "model2"]
}
```

### 获取图像
```
GET /api/image/{folder}/{filename}
```

## 注意事项

1. 确保服务器根目录下的图像文件格式为：png, jpg, jpeg, bmp
2. 确保GT文件夹和模型输出文件夹中的图像文件名相同
3. 请勿在生产环境中使用开发服务器，建议使用Gunicorn等生产级WSGI服务器

## 性能优化

- 图像加载采用异步方式，避免页面卡顿
- 放大查看功能使用Canvas API，保证放大后细节清晰
- 支持大图像的渐进式加载

## 后续扩展

- 支持更多图像格式
- 添加图像标注功能
- 支持图像差异自动检测
- 添加用户权限管理
