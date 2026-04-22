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

# 支持前导零匹配：提取数字ID进行匹配
def extract_image_id(filename):
    """从文件名中提取数字ID（去除前导零）"""
    name = os.path.splitext(filename)[0]  # 去掉扩展名
    # 处理BasicSR格式：{image_id}_{iteration}.png
    if '_' in name:
        name = name.split('_')[0]
    # 尝试转换为整数再转回字符串，去除前导零
    try:
        return str(int(name))
    except ValueError:
        return name

@app.route('/api/images', methods=['POST'])
def get_images():
    data = request.get_json()
    gt_folders = data.get('gt_folders', [])
    model_folders = data.get('model_folders', [])

    # 兼容旧API：如果传的是单个gt_folder，转换为列表
    if not gt_folders and data.get('gt_folder'):
        gt_folders = [data.get('gt_folder')]

    if not gt_folders:
        return jsonify({'error': 'GT folder is required'}), 400

    # 直接使用完整路径
    gt_paths = [os.path.abspath(folder) for folder in gt_folders]
    model_paths = [os.path.abspath(folder) for folder in model_folders]

    # 验证路径是否允许访问
    for gt_path in gt_paths:
        if not is_path_allowed(gt_path):
            return jsonify({'error': f'GT folder {gt_path} access denied'}), 403

    for path in model_paths:
        if not is_path_allowed(path):
            return jsonify({'error': f'Model folder {path} access denied'}), 403

    # 检查模型文件夹是否是BasicSR格式
    is_basicsr = False
    basicsr_info = {}  # {image_id: {model_index: {'subfolder': subfolder_name, 'iterations': [...]}}}

    for model_index, model_path in enumerate(model_paths):
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
                        original_filenames = {}  # {iteration: original_filename}
                        for img in iter_images:
                            try:
                                # 解析文件名：{image_id}_{iteration}.png
                                parts = img.split('_')
                                if len(parts) == 2:
                                    iter_num = int(parts[1].split('.')[0])
                                    iterations.append(iter_num)
                                    original_filenames[iter_num] = img
                            except:
                                pass
                        # 按迭代次数排序
                        iterations.sort()
                        if iterations:
                            # 使用extract_image_id统一ID格式
                            img_id = extract_image_id(subfolder)
                            if img_id not in basicsr_info:
                                basicsr_info[img_id] = {}
                            basicsr_info[img_id][model_index] = {
                                'subfolder': subfolder,
                                'iterations': iterations,
                                'original_filenames': original_filenames
                            }
        except:
            pass

    # 处理图像列表
    if is_basicsr:
        # BasicSR格式：返回所有图片ID和迭代信息
        # 构建GT图片的ID到文件名的映射
        all_gt_images = {}  # {image_id: {gt_folder_index: filename}}
        for gt_index, gt_path in enumerate(gt_paths):
            print(f"扫描GT文件夹 {gt_index}: {gt_path}")
            for file in os.listdir(gt_path):
                if file.lower().endswith(tuple(ALLOWED_EXTENSIONS)):
                    img_id = extract_image_id(file)
                    print(f"  找到文件: {file} -> ID: {img_id}")
                    if img_id not in all_gt_images:
                        all_gt_images[img_id] = {}
                    all_gt_images[img_id][gt_index] = file

        # 获取所有图片ID（取GT和模型文件夹的交集）
        all_image_ids = set(all_gt_images.keys())
        basicsr_image_ids = set(basicsr_info.keys())
        common_image_ids = all_image_ids & basicsr_image_ids

        # 转换为排序后的列表
        sorted_image_ids = sorted(list(common_image_ids), key=lambda x: int(x) if x.isdigit() else x)

        # 为每个图片ID构建返回数据
        images = []
        for img_id in sorted_image_ids:
            # 获取GT文件名列表
            gt_files_list = [all_gt_images[img_id].get(i) for i in range(len(gt_paths))]

            # 获取模型信息
            model_info = basicsr_info[img_id]
            # 获取所有模型的迭代次数（取交集）
            all_iterations = None
            for model_idx in model_info:
                if all_iterations is None:
                    all_iterations = set(model_info[model_idx]['iterations'])
                else:
                    all_iterations &= set(model_info[model_idx]['iterations'])
            iterations = sorted(list(all_iterations)) if all_iterations else []

            images.append({
                'image_id': img_id,
                'gt_filenames': gt_files_list,
                'iterations': iterations,
                'basicsr_info': model_info  # 包含每个模型的子文件夹名和原始文件名
            })

        return jsonify({
            'gt_folders': gt_folders,
            'model_folders': model_folders,
            'images': images,
            'is_basicsr': True
        })
    else:
        # 传统格式：获取所有模型文件夹中与GT同名的图像文件
        # 获取所有GT文件夹中的图像文件，并按ID合并
        all_gt_images = {}  # {image_id: {gt_folder_index: filename}}
        for gt_index, gt_path in enumerate(gt_paths):
            print(f"扫描GT文件夹 {gt_index}: {gt_path}")
            for file in os.listdir(gt_path):
                if file.lower().endswith(tuple(ALLOWED_EXTENSIONS)):
                    img_id = extract_image_id(file)
                    print(f"  找到文件: {file} -> ID: {img_id}")
                    if img_id not in all_gt_images:
                        all_gt_images[img_id] = {}
                    all_gt_images[img_id][gt_index] = file

        # 为每个模型文件夹构建ID映射
        model_image_maps = []
        for model_path in model_paths:
            model_images = {}
            for file in os.listdir(model_path):
                if file.lower().endswith(tuple(ALLOWED_EXTENSIONS)):
                    img_id = extract_image_id(file)
                    model_images[img_id] = file  # 保存原始文件名
            model_image_maps.append((model_path, model_images))

        # 找到所有文件夹中都存在的图像（基于ID匹配）
        common_images = []
        for img_id, gt_filenames in all_gt_images.items():
            # 检查该ID是否在所有GT文件夹中都存在
            exists_in_all_gt = len(gt_filenames) == len(gt_paths)
            if not exists_in_all_gt:
                continue

            exists_in_all_models = True
            model_filenames = []  # 记录每个模型文件夹中对应的文件名

            for model_path, model_images in model_image_maps:
                if img_id in model_images:
                    model_filenames.append(model_images[img_id])
                else:
                    exists_in_all_models = False
                    break

            if exists_in_all_models:
                # 返回所有GT文件夹中的文件名（按GT文件夹顺序）
                gt_files_list = [gt_filenames[i] for i in range(len(gt_paths))]
                print(f"ID {img_id}: GT文件 = {gt_files_list}, 模型文件 = {model_filenames}")
                common_images.append({
                    'image_id': img_id,
                    'gt_filenames': gt_files_list,  # 所有GT文件夹中的文件名列表
                    'model_filenames': model_filenames
                })

        # 按数字ID排序
        common_images.sort(key=lambda x: int(x['image_id']) if x['image_id'].isdigit() else x['image_id'])

        return jsonify({
            'gt_folders': gt_folders,
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
    app.run(host='0.0.0.0', port=1167)
