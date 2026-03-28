// 全局变量
let currentPath = '';
let selectedFolders = [];
let gtFolders = [];  // 支持多个GT文件夹
let modelFolders = [];
let currentImages = [];
let currentImageIndex = 0;
let zoomLevel = 1;
let zoomBox = null;
let isDragging = false;
let startX, startY;
// 缩放框固定状态
let isZoomBoxFixed = false;
let fixedBoxX = 0;
let fixedBoxY = 0;
let fixedZoomBoxSize = 150;
// 绘图相关变量
let isDrawing = false;
let isErasing = false; // 是否为橡皮擦模式
let currentDrawingData = []; // 存储当前绘制的路径点
const BRUSH_COLOR = '#4caf50'; // 画笔颜色（绿色，与主题一致）
const BRUSH_SIZE = 3;
const ERASER_SIZE = 20;
// 同步像素显示相关变量
let syncRelativeX = -1; // 相对位置X (0-1)
let syncRelativeY = -1; // 相对位置Y (0-1)
// 全局相对坐标（用于同步显示灰度值，0-1之间的相对位置）
let globalRelativeX = -1;
let globalRelativeY = -1;
// BasicSR相关变量
let isBasicSR = false;
let basicSRInfo = [];
let selectedIterations = {};

// 同步更新所有放大框的灰度值
function syncUpdateAllGrayValues() {
    const allZoomItems = document.querySelectorAll('.zoom-item');
    allZoomItems.forEach(item => {
        const event = new CustomEvent('updateGrayValue');
        item.dispatchEvent(event);
    });
    
    // 更新主图像上的像素标记
    updatePixelMarkers();
}

// 动态获取当前页面的域名和端口
const currentProtocol = window.location.protocol;
const currentHost = window.location.host;

// 动态构建 API 基础 URL
const API_BASE_URL = `${currentProtocol}//${currentHost}/api`;
console.log('API基础URL:', API_BASE_URL);

// DOM元素
const folderSelectionPanel = document.getElementById('folder-selection');
const imageComparisonPanel = document.getElementById('image-comparison');
const gtFolderSelect = document.getElementById('gt-folder');
const modelFoldersSelect = document.getElementById('model-folders');
const compareBtn = document.getElementById('compare-btn');
const backBtn = document.getElementById('back-btn');
const imageListSelect = document.getElementById('image-list');
const zoomLevelSlider = document.getElementById('zoom-level');
const zoomValueDisplay = document.getElementById('zoom-value');
const imageRow = document.querySelector('.image-row');
const zoomView = document.getElementById('zoom-view');
const zoomContent = document.querySelector('.zoom-content');

// 为GT和模型文件夹列表分别添加独立的路径追踪
let gtCurrentPath = '';
let modelCurrentPath = '';

// 获取迷你文件夹列表元素
const gtFolderListMini = document.getElementById('gt-folder-list');
const modelFolderListMini = document.getElementById('model-folder-list');

// 获取路径的basename
function getBasename(path) {
    if (!path) return '';
    // 移除末尾的斜杠
    path = path.replace(/\/$/, '');
    // 获取最后一部分
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
}

// 初始化
function init() {
    console.log('初始化应用...');
    console.log('当前API_BASE_URL:', API_BASE_URL);
    
    // 确保DOM元素已经加载完成
    if (!gtFolderSelect) {
        console.error('gtFolderSelect元素未找到');
        return;
    }
    
    if (!modelFoldersSelect) {
        console.error('modelFoldersSelect元素未找到');
        return;
    }
    
    if (!gtFolderListMini) {
        console.error('gtFolderListMini元素未找到');
        return;
    }
    
    if (!modelFolderListMini) {
        console.error('modelFolderListMini元素未找到');
        return;
    }
    
    // 分别加载GT和模型文件夹列表
    loadGtFolders('');
    loadModelFolders('');
    
    compareBtn.addEventListener('click', handleCompare);
    backBtn.addEventListener('click', handleBack);
    zoomLevelSlider.addEventListener('input', handleZoomChange);
}

// 加载GT文件夹列表
function loadGtFolders(path) {
    gtCurrentPath = path;
    
    fetch(`${API_BASE_URL}/folders?path=${encodeURIComponent(path)}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                return;
            }
            
            renderGtFolderList(data.folders);
        })
        .catch(error => {
            console.error('Error loading GT folders:', error);
            alert('加载GT文件夹失败');
        });
}

// 加载模型文件夹列表
function loadModelFolders(path) {
    modelCurrentPath = path;
    
    fetch(`${API_BASE_URL}/folders?path=${encodeURIComponent(path)}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                return;
            }
            
            renderModelFolderList(data.folders);
        })
        .catch(error => {
            console.error('Error loading model folders:', error);
            alert('加载模型文件夹失败');
        });
}

// 渲染GT文件夹列表
function renderGtFolderList(folders) {
    gtFolderListMini.innerHTML = '';
    
    // 添加返回上级按钮
    if (gtCurrentPath) {
        const backItem = document.createElement('div');
        backItem.className = 'folder-item';
        backItem.textContent = '.. (返回上级)';
        backItem.addEventListener('click', () => {
            // 找到最后一个 '/' 的位置
            const lastSlashIndex = gtCurrentPath.lastIndexOf('/');
            if (lastSlashIndex === -1) {
                // 如果没有 '/'，说明是根目录列表
                loadGtFolders('');
            } else {
                // 否则返回上级目录
                const parentPath = gtCurrentPath.substring(0, lastSlashIndex);
                loadGtFolders(parentPath);
            }
        });
        gtFolderListMini.appendChild(backItem);
    }
    
    // 添加子文件夹
    folders.forEach(folder => {
        const folderItem = document.createElement('div');
        folderItem.className = 'folder-item';
        folderItem.textContent = folder.name;
        folderItem.setAttribute('data-path', folder.path);
        
        // 添加点击事件
        folderItem.addEventListener('click', () => {
            if (folder.is_dir) {
                // 如果是文件夹，继续浏览
                loadGtFolders(folder.path);
            } else {
                // 如果是文件，将路径设置到GT文件夹选择框
                const path = folder.path;
                
                // 检查路径是否已在选项中
                let optionExists = false;
                for (let i = 0; i < gtFolderSelect.options.length; i++) {
                    if (gtFolderSelect.options[i].value === path) {
                        optionExists = true;
                        gtFolderSelect.selectedIndex = i;
                        break;
                    }
                }
                
                // 如果路径不存在，添加新选项
                if (!optionExists) {
                    const option = document.createElement('option');
                    option.value = path;
                    option.textContent = folder.name;
                    gtFolderSelect.appendChild(option);
                    gtFolderSelect.selectedIndex = gtFolderSelect.options.length - 1;
                }
                
                // 同时更新GT路径输入框
                document.getElementById('gt-folder-path').value = path;
            }
        });
        gtFolderListMini.appendChild(folderItem);
    });
    
    // 更新GT下拉选择框内容
    updateGtFolderSelect(folders);
}

// 渲染模型文件夹列表
function renderModelFolderList(folders) {
    modelFolderListMini.innerHTML = '';
    
    // 添加返回上级按钮
    if (modelCurrentPath) {
        const backItem = document.createElement('div');
        backItem.className = 'folder-item';
        backItem.textContent = '.. (返回上级)';
        backItem.addEventListener('click', () => {
            // 找到最后一个 '/' 的位置
            const lastSlashIndex = modelCurrentPath.lastIndexOf('/');
            if (lastSlashIndex === -1) {
                // 如果没有 '/'，说明是根目录列表
                loadModelFolders('');
            } else {
                // 否则返回上级目录
                const parentPath = modelCurrentPath.substring(0, lastSlashIndex);
                loadModelFolders(parentPath);
            }
        });
        modelFolderListMini.appendChild(backItem);
    }
    
    // 添加子文件夹
    folders.forEach(folder => {
        const folderItem = document.createElement('div');
        folderItem.className = 'folder-item';
        folderItem.textContent = folder.name;
        folderItem.setAttribute('data-path', folder.path);
        
        // 添加点击事件
        folderItem.addEventListener('click', () => {
            if (folder.is_dir) {
                // 如果是文件夹，继续浏览
                loadModelFolders(folder.path);
            } else {
                // 如果是文件，将路径添加到模型文件夹选择框
                const path = folder.path;
                
                // 检查路径是否已在选项中
                let optionExists = false;
                for (let i = 0; i < modelFoldersSelect.options.length; i++) {
                    if (modelFoldersSelect.options[i].value === path) {
                        optionExists = true;
                        modelFoldersSelect.options[i].selected = true;
                        break;
                    }
                }
                
                // 如果路径不存在，添加新选项并选中
                if (!optionExists) {
                    const option = document.createElement('option');
                    option.value = path;
                    option.textContent = folder.name;
                    option.selected = true;
                    modelFoldersSelect.appendChild(option);
                }
                
                // 更新模型路径输入框
                updateModelPathsInput(modelFoldersSelect);
            }
        });
        modelFolderListMini.appendChild(folderItem);
    });
    
    // 更新模型下拉选择框内容
    updateModelFolderSelect(folders);
}

// 更新GT下拉选择框
function updateGtFolderSelect(folders) {
    // 清空现有选项
    gtFolderSelect.innerHTML = '';
    
    // 添加当前目录选项
    const currentOption = document.createElement('option');
    currentOption.value = gtCurrentPath;
    currentOption.textContent = gtCurrentPath || '(根目录)';
    gtFolderSelect.appendChild(currentOption);
    
    // 添加所有文件夹和文件选项
    folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.path;
        option.textContent = folder.name + (folder.is_dir ? ' (文件夹)' : ' (文件)');
        gtFolderSelect.appendChild(option);
    });
}

// 更新模型下拉选择框
function updateModelFolderSelect(folders) {
    // 清空现有选项
    modelFoldersSelect.innerHTML = '';
    
    // 添加当前目录选项
    const currentOption = document.createElement('option');
    currentOption.value = modelCurrentPath;
    currentOption.textContent = modelCurrentPath || '(根目录)';
    modelFoldersSelect.appendChild(currentOption);
    
    // 添加所有文件夹和文件选项
    folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.path;
        option.textContent = folder.name + (folder.is_dir ? ' (文件夹)' : ' (文件)');
        modelFoldersSelect.appendChild(option);
    });
}

// 更新模型路径输入框
function updateModelPathsInput(selectElement) {
    const selectedOptions = Array.from(selectElement.selectedOptions);
    const paths = selectedOptions.map(option => option.value);
    document.getElementById('model-folders-paths').value = paths.join(',');
}

// 获取直接输入的文件夹路径
const gtFolderPathInput = document.getElementById('gt-folder-path');
const modelFoldersPathsInput = document.getElementById('model-folders-paths');

// 浏览按钮
const browseGtBtn = document.getElementById('browse-gt');
const browseModelBtn = document.getElementById('browse-model');

// 为浏览按钮添加事件监听器
browseGtBtn.addEventListener('click', () => {
    // 当点击GT浏览按钮时，打开文件夹选择模态框
    alert('GT文件夹浏览功能');
    // 这里可以实现更复杂的文件夹浏览逻辑，比如弹出新的浏览面板
});

browseModelBtn.addEventListener('click', () => {
    // 当点击模型浏览按钮时，打开文件夹选择模态框
    alert('模型文件夹浏览功能');
    // 这里可以实现更复杂的文件夹浏览逻辑，比如弹出新的浏览面板
});

// 处理对比按钮点击
function handleCompare() {
    // 处理GT文件夹路径（支持逗号分隔的多个路径）
    const gtPathsInput = gtFolderPathInput.value.trim();
    if (gtPathsInput) {
        // 分割逗号分隔的路径并去除空格
        gtFolders = gtPathsInput.split(',').map(path => path.trim()).filter(path => path);
    } else {
        // 如果没有直接输入路径，则使用选择的路径（支持多选）
        const selectedOptions = Array.from(gtFolderSelect.selectedOptions);
        gtFolders = selectedOptions.map(option => option.value);
    }

    // 处理模型文件夹路径
    const pathsInput = modelFoldersPathsInput.value.trim();
    if (pathsInput) {
        // 分割逗号分隔的路径并去除空格
        modelFolders = pathsInput.split(',').map(path => path.trim()).filter(path => path);
    } else {
        // 如果没有直接输入路径，则使用选择的路径
        const selectedOptions = Array.from(modelFoldersSelect.selectedOptions);
        modelFolders = selectedOptions.map(option => option.value);
    }

    if (gtFolders.length === 0) {
        alert('请选择或输入至少一个GT文件夹');
        return;
    }

    if (modelFolders.length === 0) {
        alert('请选择或输入至少一个模型输出文件夹');
        return;
    }

    // 请求获取共同图像（传递所有GT文件夹）
    fetch(`${API_BASE_URL}/images`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            gt_folders: gtFolders,
            model_folders: modelFolders
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
            return;
        }
        
        currentImages = data.images;
        isBasicSR = data.is_basicsr || false;
        basicSRInfo = data.basicsr_info || [];
        
        if (currentImages.length === 0) {
            alert('没有找到共同的图像文件');
            return;
        }
        
        // 切换到图像对比界面
        switchToComparison();
        renderImageList();
        loadCurrentImage();
    })
    .catch(error => {
        console.error('Error loading images:', error);
        alert('加载图像失败');
    });
}

// 切换到图像对比界面
function switchToComparison() {
    folderSelectionPanel.classList.remove('active');
    imageComparisonPanel.classList.add('active');
}

// 返回文件夹选择界面
function handleBack() {
    imageComparisonPanel.classList.remove('active');
    folderSelectionPanel.classList.add('active');
    // 重置状态
    currentImages = [];
    currentImageIndex = 0;
    gtFolders = [];  // 重置GT文件夹列表
    modelFolders = [];  // 重置模型文件夹列表
    clearImageRow();
    hideZoomView();
}

// 渲染图像列表
function renderImageList() {
    imageListSelect.innerHTML = '';

    currentImages.forEach((image, index) => {
        const option = document.createElement('option');
        option.value = index;

        // 根据图像格式显示不同的文本
        if (isBasicSR && typeof image === 'object' && image.image_id) {
            option.textContent = `${image.image_id}.png`;
        } else if (typeof image === 'object' && image.image_id) {
            // 传统格式新API：使用image_id
            option.textContent = `${image.image_id}.png`;
        } else {
            option.textContent = image;
        }

        imageListSelect.appendChild(option);
    });

    imageListSelect.addEventListener('change', (e) => {
        currentImageIndex = parseInt(e.target.value);
        loadCurrentImage();
    });
}

// 加载当前选中的图像
function loadCurrentImage() {
    if (currentImages.length === 0) return;

    const image = currentImages[currentImageIndex];
    clearImageRow();

    // 获取当前图片的名称或ID
    let imageId;
    let gtFilenames = [];  // 每个GT文件夹对应的文件名

    if (typeof image === 'object' && image.image_id) {
        // 新API格式（BasicSR和传统格式都使用gt_filenames）
        imageId = image.image_id;
        gtFilenames = image.gt_filenames || [];  // 所有GT文件夹中的文件名列表
    } else {
        // 传统格式：图片是一个字符串
        imageId = typeof image === 'string' ? image.split('.')[0] : image.toString();
        gtFilenames = [image];
    }

    // 创建GT图像（支持多个GT，使用basename作为显示名称）
    gtFolders.forEach((gtFolder, gtIndex) => {
        const gtName = gtFolders.length > 1 ? getBasename(gtFolder) : 'GT';
        // 使用对应GT文件夹中的文件名（考虑前导零差异）
        const gtImageName = gtFilenames[gtIndex] || gtFilenames[0] || `${imageId}.png`;
        const gtImage = createImageElement(gtName, gtFolder, gtImageName);
        imageRow.appendChild(gtImage);
    });

    // 创建模型输出图像
    modelFolders.forEach((folder, index) => {
        const modelName = getBasename(folder);

        if (isBasicSR && typeof image === 'object') {
            // BasicSR格式：显示迭代选择器
            const modelWrapper = document.createElement('div');
            modelWrapper.className = 'image-wrapper';
            
            // 创建标题
            const titleElement = document.createElement('h3');
            titleElement.textContent = modelName;
            modelWrapper.appendChild(titleElement);
            
            // 创建迭代选择器
            const iterSelect = document.createElement('select');
            iterSelect.className = 'iteration-selector';
            iterSelect.dataset.modelIndex = index;
            iterSelect.dataset.imageId = imageId;
            
            // 获取该图片的迭代次数
            if (image && image.iterations && image.iterations.length > 0) {
                // 获取该模型的BasicSR信息
                const modelBasicInfo = image.basicsr_info && image.basicsr_info[index];
                const subfolder = modelBasicInfo ? modelBasicInfo.subfolder : imageId;
                const originalFilenames = modelBasicInfo ? modelBasicInfo.original_filenames : {};
                
                // 默认选择最后一个迭代（最新的）
                image.iterations.forEach(iter => {
                    const option = document.createElement('option');
                    option.value = iter;
                    option.textContent = `迭代 ${iter}`;
                    iterSelect.appendChild(option);
                });
                
                // 设置默认选择的迭代次数
                const defaultIter = selectedIterations[`${index}-${imageId}`] || image.iterations[image.iterations.length - 1];
                iterSelect.value = defaultIter;
                selectedIterations[`${index}-${imageId}`] = defaultIter;
                
                // 创建图片 - 使用原始文件名（考虑前导零）
                const basicSRImageName = originalFilenames[defaultIter] || `${imageId}_${defaultIter}.png`;
                const basicSRPath = `${folder}/${subfolder}/${basicSRImageName}`;
                const modelImage = createImageElement('', folder, basicSRImageName, basicSRPath);
                modelImage.dataset.imageId = imageId;
                modelImage.dataset.modelIndex = index;
                modelImage.dataset.iteration = defaultIter;
                
                modelWrapper.appendChild(iterSelect);
                modelWrapper.appendChild(modelImage);
                
                // 添加迭代选择器的事件监听
                iterSelect.addEventListener('change', (e) => {
                    const newIter = parseInt(e.target.value);
                    selectedIterations[`${index}-${imageId}`] = newIter;
                    
                    // 更新图片 - 使用原始文件名
                    const newImageName = originalFilenames[newIter] || `${imageId}_${newIter}.png`;
                    const newImagePath = `${folder}/${subfolder}/${newImageName}`;
                    const imageElement = modelImage.querySelector('img');
                    if (imageElement) {
                        imageElement.src = `${API_BASE_URL}/image?path=${encodeURIComponent(newImagePath)}`;
                        modelImage.dataset.iteration = newIter;
                    }
                });
            }
            
            imageRow.appendChild(modelWrapper);
        } else {
            // 传统格式：直接创建图片
            const modelImage = createImageElement(modelName, folder, imageName);
            imageRow.appendChild(modelImage);
        }
    });
}

// 创建图像元素
function createImageElement(title, folder, imageName, customPath = null) {
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'image-wrapper';
    
    // 创建标题元素
    if (title) {
        const titleElement = document.createElement('h3');
        titleElement.textContent = title;
        imageWrapper.appendChild(titleElement);
    }
    
    // 创建图像显示区域
    const imageDisplay = document.createElement('div');
    imageDisplay.className = 'image-display';
    
    // 创建图像元素
    const image = document.createElement('img');
    
    // 构建完整路径并使用查询参数传递
    let fullImagePath;
    if (customPath) {
        fullImagePath = customPath;
    } else {
        fullImagePath = folder + '/' + imageName;
    }
    
    image.src = `${API_BASE_URL}/image?path=${encodeURIComponent(fullImagePath)}`;
    image.alt = title || imageName;
    
    // 添加缩放框
    const zoomBoxElement = document.createElement('div');
    zoomBoxElement.className = 'zoom-box';
    zoomBoxElement.style.display = 'none';
    
    // 构建DOM结构
    imageDisplay.appendChild(image);
    imageDisplay.appendChild(zoomBoxElement);
    imageWrapper.appendChild(imageDisplay);
    
    // 添加事件监听器
    imageDisplay.addEventListener('mousemove', (e) => handleMouseMove(e, imageDisplay, image));
    imageDisplay.addEventListener('mouseenter', () => showZoomView());
    imageDisplay.addEventListener('mouseleave', () => handleMouseLeave());
    imageDisplay.addEventListener('click', (e) => handleImageClick(e, imageDisplay, image));
    
    return imageWrapper;
}

// 清空图像行
function clearImageRow() {
    imageRow.innerHTML = '';
    zoomContent.innerHTML = '';
}

// 处理鼠标移动
function handleMouseMove(e, imageDisplay, image) {
    if (zoomLevel <= 1) return;

    // 如果缩放框已固定，不更新位置
    if (isZoomBoxFixed) return;

    const rect = imageDisplay.getBoundingClientRect();

    // 获取图像在容器中的实际位置和尺寸
    const imgRect = image.getBoundingClientRect();

    // 计算图像左上角相对于容器的偏移量
    const imgOffsetX = imgRect.left - rect.left;
    const imgOffsetY = imgRect.top - rect.top;

    // 计算鼠标在图像上的实际坐标
    const x = e.clientX - rect.left - imgOffsetX;
    const y = e.clientY - rect.top - imgOffsetY;

    // 更新缩放框位置 - 使用固定大小的方形框
    const zoomBoxSize = 150; // 固定大小的方形框
    const boxX = Math.max(0, Math.min(x - zoomBoxSize / 2, imgRect.width - zoomBoxSize));
    const boxY = Math.max(0, Math.min(y - zoomBoxSize / 2, imgRect.height - zoomBoxSize));

    // 计算缩放框在容器中的实际位置（考虑图像偏移）
    const containerBoxX = boxX + imgOffsetX;
    const containerBoxY = boxY + imgOffsetY;

    const zoomBoxes = document.querySelectorAll('.zoom-box');
    zoomBoxes.forEach(box => {
        box.style.display = 'block';
        box.style.width = `${zoomBoxSize}px`;
        box.style.height = `${zoomBoxSize}px`;
        box.style.left = `${containerBoxX}px`;
        box.style.top = `${containerBoxY}px`;
    });

    // 保存当前位置（用于固定时使用）
    fixedBoxX = boxX;
    fixedBoxY = boxY;
    fixedZoomBoxSize = zoomBoxSize;

    // 计算并保存全局像素坐标（基于原始图像）
    const scaleFactorX = image.naturalWidth / image.clientWidth;
    const scaleFactorY = image.naturalHeight / image.clientHeight;
    globalPixelX = Math.floor((boxX + zoomBoxSize / 2) * scaleFactorX);
    globalPixelY = Math.floor((boxY + zoomBoxSize / 2) * scaleFactorY);

    // 更新缩放视图
    updateZoomView(boxX, boxY, zoomBoxSize, image);
}

// 处理图片点击 - 切换缩放框固定状态
function handleImageClick(e, imageDisplay, image) {
    if (zoomLevel <= 1) return;

    // 切换固定状态
    isZoomBoxFixed = !isZoomBoxFixed;

    if (isZoomBoxFixed) {
        // 固定状态：保持当前位置不变，重新渲染以显示笔记框
        // 使用已保存的位置更新缩放视图
        updateZoomView(fixedBoxX, fixedBoxY, fixedZoomBoxSize, image);
    } else {
        // 恢复跟随状态：清除绘图并重新渲染
        currentDrawingData = [];
        handleMouseMove(e, imageDisplay, image);
    }
}

// 处理鼠标离开
function handleMouseLeave() {
    // 如果缩放框已固定，不隐藏视图
    if (isZoomBoxFixed) return;

    hideZoomView();
    const zoomBoxes = document.querySelectorAll('.zoom-box');
    zoomBoxes.forEach(box => box.style.display = 'none');
}

// 处理缩放级别变化
function handleZoomChange() {
    zoomLevel = parseFloat(zoomLevelSlider.value);
    zoomValueDisplay.textContent = `${zoomLevel}x`;

    // 重置固定状态
    isZoomBoxFixed = false;

    if (zoomLevel === 1) {
        hideZoomView();
        const zoomBoxes = document.querySelectorAll('.zoom-box');
        zoomBoxes.forEach(box => box.style.display = 'none');
    } else {
        // 触发鼠标移动事件以更新缩放视图
        const imageDisplays = document.querySelectorAll('.image-display');
        if (imageDisplays.length > 0) {
            const rect = imageDisplays[0].getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const event = new MouseEvent('mousemove', {
                clientX: centerX,
                clientY: centerY
            });
            
            imageDisplays[0].dispatchEvent(event);
        }
    }
}

// 更新缩放视图
function updateZoomView(boxX, boxY, zoomBoxSize, referenceImage) {
    if (zoomLevel === 1) return;
    
    zoomContent.innerHTML = '';
    
    // 获取当前图片信息
    const image = currentImages[currentImageIndex];

    // 获取当前图片的名称或ID
    let imageId;
    let gtFilenames = [];

    if (typeof image === 'object' && image.image_id) {
        // 新API格式（BasicSR和传统格式都使用gt_filenames）
        imageId = image.image_id;
        gtFilenames = image.gt_filenames || [];
    } else {
        // 传统格式：图片是一个字符串
        imageId = typeof image === 'string' ? image.split('.')[0] : image.toString();
        gtFilenames = [image];
    }

    // 直接使用鼠标在显示图像上的坐标，不进行额外缩放
    // 因为我们将在createZoomItem函数中正确处理缩放关系

    // 创建GT缩放视图（支持多个GT，使用basename作为显示名称）
    gtFolders.forEach((gtFolder, gtIndex) => {
        const gtName = gtFolders.length > 1 ? getBasename(gtFolder) : 'GT';
        // 使用对应GT文件夹中的文件名
        const gtImageName = gtFilenames[gtIndex] || gtFilenames[0] || `${imageId}.png`;
        const gtZoomItem = createZoomItem(gtName, gtFolder, gtImageName, boxX, boxY, zoomBoxSize, referenceImage);
        zoomContent.appendChild(gtZoomItem);
    });

    // 创建模型输出缩放视图
    modelFolders.forEach((folder, index) => {
        const modelName = getBasename(folder);

        if (isBasicSR && typeof image === 'object') {
            // BasicSR格式：需要处理迭代次数
            const imageId = image.image_id || image.id || image.toString();
            const selectedIter = selectedIterations[`${index}-${imageId}`] ||
                               (image.iterations && image.iterations.length > 0 ? image.iterations[image.iterations.length - 1] : 0);
            // 获取该模型的BasicSR信息
            const modelBasicInfo = image.basicsr_info && image.basicsr_info[index];
            const subfolder = modelBasicInfo ? modelBasicInfo.subfolder : imageId;
            const originalFilenames = modelBasicInfo ? modelBasicInfo.original_filenames : {};
            const iterImageName = originalFilenames[selectedIter] || `${imageId}_${selectedIter}.png`;
            const modelZoomItem = createZoomItem(modelName, folder + '/' + subfolder, iterImageName, boxX, boxY, zoomBoxSize, referenceImage);
            zoomContent.appendChild(modelZoomItem);
        } else {
            // 传统格式：直接使用图片名称
            const modelZoomItem = createZoomItem(modelName, folder, imageName, boxX, boxY, zoomBoxSize, referenceImage);
            zoomContent.appendChild(modelZoomItem);
        }
    });
}

// 创建缩放视图项
function createZoomItem(title, folder, imageName, boxX, boxY, zoomBoxSize, referenceImage) {
    const zoomItem = document.createElement('div');
    zoomItem.className = 'zoom-item';

    // 根据放大倍数动态调整框的大小，基础大小200px
    const baseSize = 200;
    const dynamicSize = baseSize * zoomLevel;
    zoomItem.style.width = `${dynamicSize}px`;
    zoomItem.style.height = `${dynamicSize}px`;

    const titleElement = document.createElement('h4');
    titleElement.textContent = title;

    const image = document.createElement('img');
    // 构建完整路径并使用查询参数传递
    const fullImagePath = folder + '/' + imageName;
    image.src = `${API_BASE_URL}/image?path=${encodeURIComponent(fullImagePath)}`;

    // 计算当前显示的参考图像与原始图像的比例
    const scaleFactorX = referenceImage.naturalWidth / referenceImage.clientWidth;
    const scaleFactorY = referenceImage.naturalHeight / referenceImage.clientHeight;

    // 计算原始图像上的实际坐标和缩放框大小
    const originalX = boxX * scaleFactorX;
    const originalY = boxY * scaleFactorY;

    // 设置缩放图像位置
    image.style.transform = `scale(${zoomLevel})`;
    image.style.left = `-${originalX * zoomLevel}px`;
    image.style.top = `-${originalY * zoomLevel}px`;

    zoomItem.appendChild(image);
    zoomItem.appendChild(titleElement);

    // 添加像素灰度值显示
    const pixelValueDisplay = document.createElement('div');
    pixelValueDisplay.className = 'pixel-value-display';
    pixelValueDisplay.textContent = 'Gray: -';
    zoomItem.appendChild(pixelValueDisplay);

    // 创建隐藏的canvas用于获取像素数据
    const pixelCanvas = document.createElement('canvas');
    pixelCanvas.style.display = 'none';
    zoomItem.appendChild(pixelCanvas);

    // 更新灰度值显示的函数（基于鼠标在当前放大框中的位置）
    function updateGrayValue(mouseX, mouseY) {
        if (pixelCanvas.width <= 0 || pixelCanvas.height <= 0) {
            return;
        }

        const rect = zoomItem.getBoundingClientRect();
        // 确保鼠标坐标在有效范围内
        const relativeX = Math.max(0, Math.min(mouseX / rect.width, 1));
        const relativeY = Math.max(0, Math.min(mouseY / rect.height, 1));

        // 放大框显示的原始图像区域大小
        const zoomBoxOriginalWidth = zoomBoxSize * scaleFactorX;
        const zoomBoxOriginalHeight = zoomBoxSize * scaleFactorY;

        // 当前图片与参考图片的尺寸比例
        const imgScaleFactorX = pixelCanvas.width / referenceImage.naturalWidth;
        const imgScaleFactorY = pixelCanvas.height / referenceImage.naturalHeight;

        // 计算当前图片中对应的原始坐标
        const refOriginalX = boxX * scaleFactorX;
        const refOriginalY = boxY * scaleFactorY;

        // 在当前图片中的起始位置
        const currentImgStartX = refOriginalX * imgScaleFactorX;
        const currentImgStartY = refOriginalY * imgScaleFactorY;

        // 放大框在当前图片中显示的宽度/高度
        const currentZoomWidth = zoomBoxOriginalWidth * imgScaleFactorX;
        const currentZoomHeight = zoomBoxOriginalHeight * imgScaleFactorY;

        // 根据鼠标相对位置计算当前图片中的像素坐标
        const originalX = Math.floor(currentImgStartX + relativeX * currentZoomWidth);
        const originalY = Math.floor(currentImgStartY + relativeY * currentZoomHeight);

        if (originalX >= 0 && originalX < pixelCanvas.width && originalY >= 0 && originalY < pixelCanvas.height) {
            const pixelCtx = pixelCanvas.getContext('2d');
            const pixelData = pixelCtx.getImageData(originalX, originalY, 1, 1).data;
            // 计算灰度值 (RGB转灰度: 0.299*R + 0.587*G + 0.114*B)
            const grayValue = Math.round(0.299 * pixelData[0] + 0.587 * pixelData[1] + 0.114 * pixelData[2]);
            pixelValueDisplay.textContent = `Gray: ${grayValue}`;
        }
    }



    // 监听灰度值更新事件
    zoomItem.addEventListener('updateGrayValue', () => {
        if (syncRelativeX >= 0 && syncRelativeY >= 0) {
            updateGrayValue(syncRelativeX * zoomItem.getBoundingClientRect().width, 
                          syncRelativeY * zoomItem.getBoundingClientRect().height);
        }
    });

    // 添加鼠标移动事件监听，更新全局相对位置并同步所有放大框的灰度值
    zoomItem.addEventListener('mousemove', (e) => {
        const rect = zoomItem.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 更新全局相对位置
        syncRelativeX = mouseX / rect.width;
        syncRelativeY = mouseY / rect.height;

        // 同步更新所有放大框的灰度值
        syncUpdateAllGrayValues();
    });

    // 图片加载完成后绘制到canvas
    image.onload = () => {
        pixelCanvas.width = image.naturalWidth;
        pixelCanvas.height = image.naturalHeight;
        const pixelCtx = pixelCanvas.getContext('2d');
        pixelCtx.drawImage(image, 0, 0);
    };

    // 立即尝试（如果图片已缓存）
    if (image.complete) {
        pixelCanvas.width = image.naturalWidth;
        pixelCanvas.height = image.naturalHeight;
        const pixelCtx = pixelCanvas.getContext('2d');
        pixelCtx.drawImage(image, 0, 0);
    }

    // 添加绘图画布（仅在固定状态时显示）
    if (isZoomBoxFixed) {
        const canvas = document.createElement('canvas');
        canvas.className = 'drawing-canvas';
        canvas.width = dynamicSize;
        canvas.height = dynamicSize;

        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = BRUSH_COLOR;
        ctx.lineWidth = BRUSH_SIZE;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 重绘已有的路径
        if (currentDrawingData.length > 0) {
            redrawCanvas(canvas, ctx);
        }

        // 添加绘图事件监听
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                canvas.classList.add('erasing');
            } else {
                canvas.classList.remove('erasing');
            }
            startDrawing(e, canvas, ctx);
        });
        canvas.addEventListener('mousemove', (e) => draw(e, canvas, ctx));
        canvas.addEventListener('mouseup', () => {
            canvas.classList.remove('erasing');
            stopDrawing();
        });
        canvas.addEventListener('mouseleave', () => {
            canvas.classList.remove('erasing');
            stopDrawing();
        });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // 禁用右键菜单

        zoomItem.appendChild(canvas);
    }

    return zoomItem;
}

// 重绘画布
function redrawCanvas(canvas, ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentDrawingData.length === 0) return;

    ctx.beginPath();
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < currentDrawingData.length; i++) {
        const point = currentDrawingData[i];
        if (point.type === 'start') {
            ctx.moveTo(point.x, point.y);
        } else {
            ctx.lineTo(point.x, point.y);
        }
    }
    ctx.stroke();
}

// 开始绘图
function startDrawing(e, canvas, ctx) {
    if (!isZoomBoxFixed) return;

    // 判断是左键(0)还是右键(2)
    isErasing = (e.button === 2);
    isDrawing = true;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isErasing) {
        // 橡皮擦模式：擦除圆形区域
        eraseAt(canvas, ctx, x, y);
    } else {
        // 画笔模式
        currentDrawingData.push({ type: 'start', x, y, color: BRUSH_COLOR, size: BRUSH_SIZE });
        ctx.beginPath();
        ctx.moveTo(x, y);
    }
}

// 绘图
function draw(e, canvas, ctx) {
    if (!isDrawing || !isZoomBoxFixed) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isErasing) {
        // 橡皮擦模式
        eraseAt(canvas, ctx, x, y);
    } else {
        // 画笔模式
        currentDrawingData.push({ type: 'draw', x, y });
        ctx.lineTo(x, y);
        ctx.stroke();

        // 同步到其他画布
        syncDrawingToAllCanvases();
    }
}

// 橡皮擦功能
function eraseAt(canvas, ctx, x, y) {
    const eraserRadius = ERASER_SIZE / 2;

    // 清除画布上的圆形区域
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, eraserRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 从路径数据中移除被擦除的点
    currentDrawingData = currentDrawingData.filter(point => {
        const dx = point.x - x;
        const dy = point.y - y;
        return Math.sqrt(dx * dx + dy * dy) > eraserRadius;
    });

    // 同步到其他画布
    syncDrawingToAllCanvases();
}

// 停止绘图
function stopDrawing() {
    isDrawing = false;
    isErasing = false;
}

// 同步绘图到所有画布
function syncDrawingToAllCanvases() {
    const allCanvases = document.querySelectorAll('.drawing-canvas');
    allCanvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        redrawCanvas(canvas, ctx);
    });
}

// 显示缩放视图
function showZoomView() {
    if (zoomLevel > 1) {
        zoomView.classList.add('active');
    }
}

// 隐藏缩放视图
function hideZoomView() {
    zoomView.classList.remove('active');
    const zoomBoxes = document.querySelectorAll('.zoom-box');
    zoomBoxes.forEach(box => box.style.display = 'none');
}

// 更新右下角小框内的像素标记
function updatePixelMarkers() {
    if (syncRelativeX < 0 || syncRelativeY < 0) return;
    
    // 移除主图像上的所有像素标记
    const mainImageMarkers = document.querySelectorAll('.image-display .pixel-marker');
    mainImageMarkers.forEach(marker => marker.remove());
    
    // 在缩放视图的每个放大项内添加像素标记
    const zoomItems = document.querySelectorAll('.zoom-item');
    zoomItems.forEach(zoomItem => {
        const image = zoomItem.querySelector('img');
        if (!image) return;
        
        // 获取缩放项的边界
        const zoomItemRect = zoomItem.getBoundingClientRect();
        
        // 计算标记位置 - 使用相对坐标确保在不同放大倍数下的一致性
        // 标记应该出现在鼠标指向的像素位置
        const markerX = syncRelativeX * zoomItemRect.width;
        const markerY = syncRelativeY * zoomItemRect.height;
        
        // 创建或更新像素标记
        let pixelMarker = zoomItem.querySelector('.pixel-marker');
        if (!pixelMarker) {
            pixelMarker = document.createElement('div');
            pixelMarker.className = 'pixel-marker';
            zoomItem.appendChild(pixelMarker);
        }
        
        pixelMarker.style.left = `${markerX}px`;
        pixelMarker.style.top = `${markerY}px`;
    });
}

// 初始化应用
document.addEventListener('DOMContentLoaded', init);
