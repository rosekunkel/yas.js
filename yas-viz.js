$(document).ready(function () {
	var editor = ace.edit("editor");
	var assembledCode = null;
	var vm = null;
	var renderHex = false;

	function renderCodeAsTable(code) {
		$('#code').empty().append($('<tbody></tbody>'));

		function opcodeArrayToString(opcodeArray) {
			var str = '';

			opcodeArray.forEach(function (entry) {
				var hexRepresentation = entry.toString(16);
				if (hexRepresentation.length === 1) {
					hexRepresentation = '0' + hexRepresentation;
				}
				str += hexRepresentation;
			});

			return str;
		}

		code.forEach(function (line, index) {
			console.log(line.opcode);
			var row = $('<tr></tr>');
			var lineNumber = $('<td></td>').append((index + 1).toString());
			var address = $('<td></td>').append('0x' + line.address.toString(16));
			var opcode = $('<td></td>')
			if (line.opcode !== null) {
				opcode.append('0x' + opcodeArrayToString(line.opcode));
			}
			var source = $('<td></td>').append($('<code></code>').append(line.source));
			row = row.append(lineNumber).append(address).append(opcode).append(source);
			$('#code > tbody').append(row);
		});
	}

	function numToPreferredString(num) {
		if (renderHex) {
			return '0x' + num.toString(16);
		} else {
			return num.toString(10);
		}
	}

	function refreshSVG() {
		$('.refreshSVG').each(function () {
			$(this).html($(this).html());
		});
	}

	function calcMaxTextWidth(strings, attributes) {
		this.cache = this.cache || {};
		var key = JSON.stringify(Array.prototype.slice.call(arguments));

		if (this.cache[key] !== undefined) {
			return this.cache[key];
		}

		var max = 0;
		$('<div />').attr({
			'id' : 'calcTextWidthTempDiv',
			'class' : 'refreshSVG'
		}).appendTo('body');

		$('<svg />').attr('id', 'calcTextWidthTempSVG').appendTo($('#calcTextWidthTempDiv'));

		strings.forEach(function (str) {
			$('<text />')
				.attr('id', 'calcTextWidthTempText')
				.attr(attributes)
				.append(str)
				.appendTo($('#calcTextWidthTempSVG'));

			refreshSVG();

			var textWidth = $('#calcTextWidthTempText').get(0).getComputedTextLength();
			max = textWidth > max ? textWidth : max;

			$('#calcTextWidthTempText').remove();
		});

		$('#calcTextWidthTempDiv').remove();

		this.cache[key] = max;
		return max;
	}

	function makeMemCell(addr, data) {
		var boxHeight = 30;
		var boxWidth = 200;
		var addressPadding = 10;
		var textVerticalCenterCorrection = 6.5;

		// We are going to be printing 4-digit numbers. Because one of the
		// digits must be the widest digit, one of these has to be the
		// widest 4-digit number (mod kerning).
		var maxAddressTextLen = calcMaxTextWidth(['0x0000', '0x1111', '0x2222',
												  '0x3333', '0x4444', '0x5555',
												  '0x6666', '0x7777', '0x8888',
												  '0x9999', '0xaaaa', '0xbbbb',
												  '0xcccc', '0xdddd', '0xeeee',
												  '0xffff'], {});

		var addressText = $('<text />').attr({
			'x' : maxAddressTextLen,
			'y' : boxHeight + textVerticalCenterCorrection,
			'text-anchor' : 'end'
		}).text(addr);

		var box = $('<rect />').attr({
			'x' : maxAddressTextLen + addressPadding,
			'y' : 1,
			'width' : boxWidth,
			'height' : boxHeight,
			'fill' : 'none',
			'stroke' : 'black' });

		var dataText = $('<text />').attr({
			'x' : maxAddressTextLen + addressPadding + boxWidth/2,
			'y' : boxHeight/2 + textVerticalCenterCorrection,
			'text-anchor' : 'middle'
		}).text(data);

		return $('<svg />')
			.append(box)
			.append(addressText)
			.append(dataText);
	}

	function makeRegister(reg, data, labelAbove) {
		var boxHeight = 30;
		var boxWidth = 100;
		var labelPadding = 10;
		var boxVerticalOffset = 11;
		var textVerticalCenterCorrection = 6;
		var textVerticalTopCorrection = 13;

		// We are going to be printing 4-digit numbers. Because one of the
		// digits must be the widest digit, one of these has to be the
		// widest 4-digit number (mod kerning).
		var maxLabelLen = calcMaxTextWidth(['%eax','%ebx', '%ecx',
											'%edx', '%edi', '%esi',
											'%ebp', '%esp', 'PC'], {});

		var labelText = $('<text />').attr({
			'x' : labelAbove ? boxWidth/2 : maxLabelLen,
			'y' : labelAbove ? 1 + textVerticalTopCorrection : boxHeight/2 + textVerticalCenterCorrection,
			'text-anchor' : labelAbove ? 'middle' : 'end'
		}).text(reg);

		var box = $('<rect />').attr({
			'x' : labelAbove ? 1 : maxLabelLen + labelPadding,
			'y' : labelAbove ?  textVerticalTopCorrection + boxVerticalOffset + 1 : 1,
			'width' : boxWidth,
			'height' : boxHeight,
			'fill' : 'none',
			'stroke' : 'black' });

		var dataText = $('<text />').attr({
			'x' : labelAbove ? boxWidth/2 : maxLabelLen + labelPadding + boxWidth/2,
			'y' : (labelAbove ? boxHeight/2 + boxVerticalOffset + textVerticalTopCorrection : boxHeight/2) + textVerticalCenterCorrection,
			'text-anchor' : 'middle'
		}).text(data);

		return $('<svg />')
			.append(box)
			.append(labelText)
			.append(dataText);
	}

	function updateVisualization(virtualMachine) {
		$('#memoryDiagram').empty();

		// Definition section
		// Make an arrowhead that can be added to paths
		$('#memoryDiagram').append($('<defs />').append($('<marker />').attr({
			'id' : 'markerArrowhead',
			'markerWidth' : 6,
			'markerHeight' : 10,
			'refx' : 6,
			'refy' : 5,
			'orient' : 'auto'
		}).append($('<path />').attr({
			'd' : 'M0,0 L6,5 L0,10',
			'fill' : 'none',
			'stroke' : 'black'
		}))));

		// Draw memory
		var numMemoryCells = 5;

		if (virtualMachine.registers['%esp'] !== 0) {
		 	numMemoryCells = (0x1000 - virtualMachine.registers['%esp'])/4 + 5;
		}

		for (var i = 0; i < numMemoryCells; ++i) {
			var addr = 0x1000 - 4*(numMemoryCells - i);
			var cell = makeMemCell(numToPreferredString(addr + 4), numToPreferredString(virtualMachine.getIntAt(addr)));
			$('#memoryDiagram').append(cell.attr({
				'x' : 190,
				'y' : 30 * i + (11 + 13)
			}));
		}

		var rightHandRegisters = ['%eax', '%ebx', '%ecx',
		 						  '%edx', '%edi', '%esi'];

		rightHandRegisters.forEach(function (register, index) {
			var reg = makeRegister(register, numToPreferredString(virtualMachine.registers[register]));
			$('#memoryDiagram').append(reg.attr({
				'x' : 500,
				'y' : (30 + 15) * index + (11 + 13),
			}));
		});

		$('#memoryDiagram').append(makeRegister('PC', numToPreferredString(virtualMachine.programCounter), true).attr({
			'x' : 680,
			'y' : 0,
		}));

		$('#memoryDiagram').append(makeRegister('Status', virtualMachine.statusCode, true).attr({
			'x' : 680,
			'y' : 90,
		}));

		var espx = 0;
		var espy = 135;
		var addressLen = calcMaxTextWidth(['0x0000', '0x1111', '0x2222',
										   '0x3333', '0x4444', '0x5555',
										   '0x6666', '0x7777', '0x8888',
										   '0x9999', '0xaaaa', '0xbbbb',
										   '0xcccc', '0xdddd', '0xeeee',
										   '0xffff'], {}) + 10;
		var espStartpointX = espx + 100;
		var espStartpointY = espy + (11 + 13 + 1) + 30/2;
		var espEndpointX = 190 + addressLen;
		var espEndpointY = (30 * (virtualMachine.registers['%esp']/4 - (0x1000/4 - numMemoryCells)) + (11 + 13 + 1));

		$('#memoryDiagram').append(makeRegister('%esp', numToPreferredString(virtualMachine.registers['%esp']), true).attr({
			'x' : espx,
			'y' : espy,
		}));

		if (virtualMachine.registers['%esp'] !== 0) {
			$('#memoryDiagram').append($('<path />').attr({
				'd' : 'M' + espStartpointX + ',' + espStartpointY + ' ' +
					'C' + (espStartpointX + 80) + ',' + espStartpointY + ' ' + (espEndpointX - 80) + ',' + espEndpointY + ' ' + espEndpointX + ',' + espEndpointY,
				'fill' : 'none',
				'stroke' : 'black',
				'style' : 'marker-end: url(#markerArrowhead)'
			}));
		}

		var ebpx = 0;
		var ebpy = 45;
		var ebpStartpointX = ebpx + 100;
		var ebpStartpointY = ebpy + (11 + 13 + 1) + 30/2;
		var ebpEndpointX = 190 + addressLen;
		var ebpEndpointY = (30 * (virtualMachine.registers['%ebp']/4 - (0x1000/4 - numMemoryCells)) + (11 + 13 + 1));

		$('#memoryDiagram').append(makeRegister('%ebp', numToPreferredString(virtualMachine.registers['%ebp']), true).attr({
			'x' : ebpx,
			'y' : ebpy,
		}));

		if (virtualMachine.registers['%ebp'] !== 0) {
			$('#memoryDiagram').append($('<path />').attr({
				'd' : 'M' + ebpStartpointX + ',' + ebpStartpointY + ' ' +
					'C' + (ebpStartpointX + 80) + ',' + ebpStartpointY + ' ' + (ebpEndpointX - 80) + ',' + ebpEndpointY + ' ' + ebpEndpointX + ',' + ebpEndpointY,
				'fill' : 'none',
				'stroke' : 'black',
				'style' : 'marker-end: url(#markerArrowhead)'
			}));
		}

		refreshSVG();

		var bbox = $('#memoryDiagram').get(0).getBBox();
		$('#memoryDiagram').attr({
			'width' : bbox.x + bbox.width + 1,
			'height' : bbox.y + bbox.height + 1,
		});
	}

	$('body').on('click', '#assemble', function (event) {
		try {
			assembledCode = Yas.assemble(editor.getValue());
			renderCodeAsTable(assembledCode);
			vm = new Yas.VM(assembledCode, function () {return prompt("Need input");});
			console.log(vm);
			updateVisualization(vm);
		} catch (e) {
			event.preventDefault();
			throw e;
		}
		event.preventDefault();
	});

	$('body').on('click', '#advance', function (event) {
		vm.advance();
		console.log(vm);

		updateVisualization(vm);

		$('#output').text(vm.output);
	});

	$('body').on('click', '#toggleHex', function (event) {
		renderHex = !renderHex;

		$('#toggleHex').text(renderHex ? 'Decimal' : 'Hexadecimal');

		updateVisualization(vm);
	});
});
