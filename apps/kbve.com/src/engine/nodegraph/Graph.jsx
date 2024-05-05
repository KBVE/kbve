import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { ForceGraph3D } from 'react-force-graph';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';


function My3DGraph() {
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (!mutation.addedNodes) return;

                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i];
                    if (node.id === 'block-content-g') {
                        const container = document.getElementById('block-content-g');
                        const root = ReactDOM.createRoot(container);
                        root.render(<ContentBlock />);
                        observer.disconnect();  // Stop observing once we've mounted our component
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        return () => observer.disconnect();
    }, []);

    return null;
}

function ContentBlock() {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const tooltipRef = useRef(null);
    const [dimensions, setDimensions] = useState({
        width: 300,
        height: 300
    });

    useEffect(() => {
        fetch('/api/graph.json').then(response => response.json()).then(data => {
            const nodes = preprocessNodes(data.nodes);
            const links = data.links;
            setGraphData({ nodes, links });
        }).catch(error => console.error('Error fetching graph data:', error));
    }, []);


    useEffect(() => {
        const handleResize = () => {
            const container = document.getElementById('block-content-g') || document.getElementById('nodegraph');
            if (container) {
                setDimensions({
                    width: container.offsetWidth,
                    height: container.offsetHeight,
                });
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize(); // Set initial size

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);
	

    function preprocessNodes(nodes) {
        let tagCenters = {};
        nodes.forEach(node => {
            node.tags.forEach(tag => {
                if (!tagCenters[tag]) {
                    tagCenters[tag] = { x: 0, y: 0, z: 0, count: 0 };
                }
                tagCenters[tag].x += Math.random() * 100;
                tagCenters[tag].y += Math.random() * 100;
                tagCenters[tag].z += Math.random() * 100;
                tagCenters[tag].count++;
            });
        });

        Object.keys(tagCenters).forEach(tag => {
            tagCenters[tag].x /= tagCenters[tag].count;
            tagCenters[tag].y /= tagCenters[tag].count;
            tagCenters[tag].z /= tagCenters[tag].count;
        });

        nodes.forEach(node => {
            let centerX = 0, centerY = 0, centerZ = 0;
            node.tags.forEach(tag => {
                centerX += tagCenters[tag].x;
                centerY += tagCenters[tag].y;
                centerZ += tagCenters[tag].z;
            });
            node.x = centerX / node.tags.length;
            node.y = centerY / node.tags.length;
            node.z = centerZ / node.tags.length;
        });

        return nodes;
    }

    return (
        <div
            className="z-40 w-full h-100vh overflow-hidden overscroll-contain relative">
            <ForceGraph3D
                graphData={graphData}
                width={dimensions.width}
                height={dimensions.height}
                nodeAutoColorBy="group"
                linkColor={link => (link.type === 'url' ? 'blue' : 'red')}
                linkWidth={link => (link.type === 'url' ? 2 : 1)}
                linkDirectionalParticles={link => (link.type === 'url' ? 2 : 0)}
                nodeThreeObject={node => {
                    const obj = new THREE.Mesh(
                        new THREE.SphereGeometry(5),
                        new THREE.MeshBasicMaterial({ color: node.color })
                    );
                    const sprite = new SpriteText(node.name);
                    sprite.color = 'white';
                    sprite.textHeight = 8;
                    sprite.material.depthWrite = false;
                    sprite.material.transparent = true;
                    sprite.position.set(0, 0, 12);
                    obj.add(sprite);
                    return obj;
                }}
                onNodeClick={handleNodeClick}
                onNodeHover={node => {
                    if (node) {
                        tooltipRef.current.style.display = 'block';
                        tooltipRef.current.style.left = `${node.x}px`;
                        tooltipRef.current.style.top = `${node.y}px`;
                        tooltipRef.current.innerHTML = node.description;
                    } else {
                        tooltipRef.current.style.display = 'none';
                    }
                }}
            />
            <div
                ref={tooltipRef}
                className="absolute bg-white p-2 rounded shadow-md hidden"
                style={{
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                }}>
                Tooltip
            </div>
        </div>
    );
}

export default My3DGraph;