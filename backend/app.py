import os
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# 配置允许访问的目录列表
ALLOWED_DIRS = [
    '/home/haoyangyue/data',  # 允许访问整个data文件夹
    os.environ.get('ROOT_DIR', '/home/images')
]
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp'}

# 辅助函数：验证路径是否在允许的目录列表中
def is_path_allowed(path):
    path = os.path.abspath(path)
    for allowed_dir in ALLOWED_DIRS:
        allowed_dir = os.path.abspath(allowed_dir)
        if path.startswith(allowed_dir) and os.path.exists(path):
            return True
    return False

@app.route('/api/folders', methods=['GET'])
def get_folders():
    path = request.args.get('path', '')
    
    try:
        # 如果是根路径请求，返回允许的目录列表
        if not path:
            items = []
            for allowed_dir in ALLOWED_DIRS:
                items.append({
                    'name': allowed_dir.split('/')[-1],
                    'path': allowed_dir,
                    'is_dir': True
                })
            return jsonify({'folders': items})
        
        # 验证路径是否允许访问
        full_path = os.path.abspath(path)
        if not is_path_allowed(full_path):
            return jsonify({'error': 'Access denied'}), 403
        
        # 列出目录内容
        items = []
        for item in os.listdir(full_path):
            item_path = os.path.join(full_path, item)
            if os.path.isdir(item_path):
                items.append({
                    'name': item,
                    'path': item_path,
                    'is_dir': True
                })
        return jsonify({'folders': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/images', methods=['POST'])
def get_images():
    data = request.get_json()
    gt_folder = data.get('gt_folder')
    model_folders = data.get('model_folders', [])
    
    if not gt_folder:
        return jsonify({'error': 'GT folder is required'}), 400
    
    # 直接使用完整路径
    gt_path = os.path.abspath(gt_folder)
    model_paths = [os.path.abspath(folder) for folder in model_folders]
    
    # 验证路径是否允许访问
    if not is_path_allowed(gt_path):
        return jsonify({'error': 'GT folder access denied'}), 403
    
    for path in model_paths:
        if not is_path_allowed(path):
            return jsonify({'error': f'Model folder {path} access denied'}), 403
    
    # 获取GT文件夹中的图像文件
    gt_images = []
    for file in os.listdir(gt_path):
        if file.lower().endswith(tuple(ALLOWED_EXTENSIONS)):
            gt_images.append(file)
    
    # 检查模型文件夹是否是BasicSR格式
    is_basicsr = False
    basicsr_info = []
    
    for model_path in model_paths:
        # 检查模型文件夹是否包含数字子文件夹
        try:
            subfolders = [f for f in os.listdir(model_path) if os.path.isdir(os.path.join(model_path, f)) and f.isdigit()]
            if subfolders:
                is_basicsr = True
                # 收集BasicSR信息
                for subfolder in subfolders:
                    subfolder_path = os.path.join(model_path, subfolder)
                    # 获取该子文件夹中的所有迭代图片
                    iter_images = [f for f in os.listdir(subfolder_path) if f.lower().endswith(tuple(ALLOWED_EXTENSIONS))]
                    if iter_images:
                        # 提取迭代次数
                        iterations = []
                        for img in iter_images:
                            try:
                                # 解析文件名：{image_id}_{iteration}.png
                                parts = img.split('_')
                                if len(parts) == 2:
                                    iter_num = int(parts[1].split('.')[0])
                                    iterations.append(iter_num)
                            except:
                                pass
                        # 按迭代次数排序
                        iterations.sort()
                        if iterations:
                            basicsr_info.append({
                                'model_path': model_path,
                                'image_id': subfolder,
                                'iterations': iterations
                            })
        except:
            pass
    
    # 处理图像列表
    if is_basicsr:
        # BasicSR格式：返回所有图片ID和迭代信息
        image_ids = set()
        for info in basicsr_info:
            image_ids.add(info['image_id'])
        
        # 确保GT图片也在列表中
        for gt_image in gt_images:
            image_id = gt_image.split('.')[0]
            image_ids.add(image_id)
        
        # 转换为排序后的列表
        sorted_image_ids = sorted(list(image_ids), key=lambda x: int(x))
        
        # 为每个图片ID找到对应的迭代次数
        images = []
        for img_id in sorted_image_ids:
            # 找到该图片的迭代次数
            iterations = []
            for info in basicsr_info:
                if info['image_id'] == img_id:
                    iterations = info['iterations']
                    break
            
            images.append({
                'image_id': img_id,
                'filename': f'{img_id}.png',
                'iterations': iterations
            })
        
        return jsonify({
            'gt_folder': gt_folder,
            'model_folders': model_folders,
            'images': images,
            'is_basicsr': True
        })
    else:
        # 传统格式：获取所有模型文件夹中与GT同名的图像文件
        common_images = []
        for image in gt_images:
            exists_in_all = True
            for model_path in model_paths:
                if not os.path.exists(os.path.join(model_path, image)):
                    exists_in_all = False
                    break
            if exists_in_all:
                common_images.append(image)
        
        return jsonify({
            'gt_folder': gt_folder,
            'model_folders': model_folders,
            'images': common_images,
            'is_basicsr': False
        })

# 配置静态文件目录
frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../frontend')

# 新的图片服务路由，使用查询参数传递图片路径
@app.route('/api/image', methods=['GET'])
def get_image():
    import urllib.parse
    import os
    from flask import request
    
    # 从查询参数获取图片路径
    image_path = request.args.get('path', '')
    print(f"查询参数中的路径: {image_path}")
    
    if not image_path:
        return jsonify({'error': 'Missing image path'}), 400
    
    # 解码URL编码的路径
    decoded_path = urllib.parse.unquote(image_path)
    print(f"解码后的路径: {decoded_path}")
    
    # 检查文件是否存在
    if not os.path.exists(decoded_path):
        print(f"文件不存在: {decoded_path}")
        return jsonify({'error': f'File not found at: {decoded_path}'}), 404
    
    try:
        # 返回文件
        return send_file(decoded_path)
    except Exception as e:
        print(f"发送文件错误: {str(e)}")
        return jsonify({'error': f'Error sending file: {str(e)}'}), 500

# 保留旧的路由作为备份
@app.route('/api/image/<path:path>', methods=['GET'])
def get_image_old(path):
    import urllib.parse
    import os
    
    # 解码URL编码的路径
    decoded_path = urllib.parse.unquote(path)
    print(f"旧路由请求的路径: {decoded_path}")
    
    # 检查文件是否存在
    if not os.path.exists(decoded_path):
        print(f"文件不存在: {decoded_path}")
        return jsonify({'error': f'File not found at: {decoded_path}'}), 404
    
    try:
        # 返回文件
        return send_file(decoded_path)
    except Exception as e:
        print(f"发送文件错误: {str(e)}")
        return jsonify({'error': f'Error sending file: {str(e)}'}), 500

# 添加一个简单的测试路由
@app.route('/test', methods=['GET'])
def test():
    return "服务正常运行"

# 提供静态文件访问
@app.route('/')
def index():
    return send_from_directory(frontend_dir, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(frontend_dir, path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8086)
