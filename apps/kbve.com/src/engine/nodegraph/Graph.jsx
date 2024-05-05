import React, { useEffect, useState, useRef } from 'react';
import { ForceGraph3D } from 'react-force-graph';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';

function My3DGraph() {
	const [graphData, setGraphData] = useState({ nodes: [], links: [] });
	const containerRef = useRef(null);
	const tooltipRef = useRef(null);
	const [dimensions, setDimensions] = useState({
		width: window.innerWidth,
		height: window.innerHeight,
	});

	useEffect(() => {
		fetch('/graph/graph_data.json')
			.then((response) => response.json())
			.then((data) => {
				const nodes = preprocessNodes(data.nodes);
				const links = data.links;
				setGraphData({ nodes, links });
			})
			.catch((error) =>
				console.error('Error fetching graph data:', error),
			);
	}, []);

	const handleNodeClick = (node) => {
		if (node.id) {
			window.open(`/${node.id}`, '_blank');
		} else {
			console.log('No URL provided for this node');
		}
	};

	useEffect(() => {
		const handleResize = () => {
			if (containerRef.current) {
				setDimensions({
					width: containerRef.current.offsetWidth,
					height: containerRef.current.offsetHeight,
				});
			}
		};

		window.addEventListener('resize', handleResize);
		handleResize(); // Set initial size

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	}, [containerRef.current]); // Ensure the effect runs when containerRef updates

	// Preprocess nodes to cluster based on tags
	function preprocessNodes(nodes) {
		let tagCenters = {};
		nodes.forEach((node) => {
			node.tags.forEach((tag) => {
				if (!tagCenters[tag]) {
					tagCenters[tag] = { x: 0, y: 0, z: 0, count: 0 };
				}
				tagCenters[tag].x += Math.random() * 100; // Randomly distribute within a range
				tagCenters[tag].y += Math.random() * 100;
				tagCenters[tag].z += Math.random() * 100;
				tagCenters[tag].count++;
			});
		});

		// Average the positions for each tag to find the center
		Object.keys(tagCenters).forEach((tag) => {
			tagCenters[tag].x /= tagCenters[tag].count;
			tagCenters[tag].y /= tagCenters[tag].count;
			tagCenters[tag].z /= tagCenters[tag].count;
		});

		// Assign node positions based on tag centers
		nodes.forEach((node) => {
			let centerX = 0,
				centerY = 0,
				centerZ = 0;
			node.tags.forEach((tag) => {
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
			ref={containerRef}
			className="w-full h-100vh overflow-hidden overscroll-contain relative">
			<ForceGraph3D
				graphData={graphData}
				width={dimensions.width}
				height={dimensions.height}
				nodeAutoColorBy="group"
				linkColor={(link) => (link.type === 'url' ? 'blue' : 'red')}
				linkWidth={(link) => (link.type === 'url' ? 2 : 1)}
				linkDirectionalParticles={(link) =>
					link.type === 'url' ? 2 : 0
				}
				nodeThreeObject={(node) => {
					const obj = new THREE.Mesh(
						new THREE.SphereGeometry(5),
						new THREE.MeshBasicMaterial({ color: node.color }),
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
				onNodeHover={(node) => {
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
